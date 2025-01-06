/**
 * @fileoverview Enhanced organization settings form component with comprehensive validation,
 * AI configuration, and role-based access control
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { z } from 'zod'; // v3.22.0
import dayjs from 'dayjs'; // v1.11.0
import { toast } from 'react-toastify'; // v9.0.0

import Form from '../shared/Form';
import { Organization, OrganizationSettings, OrganizationAIConfig, OrganizationStatus } from '../../types/organization';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { useAuth } from '../../lib/auth';

// Enhanced validation schema for organization form
const VALIDATION_SCHEMA = z.object({
  name: z.string().min(3).max(100),
  industry: z.string().min(2).max(50),
  size: z.number().positive().max(1000000),
  location: z.object({
    address: z.string().min(5).max(200),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(100),
    country: z.string().length(2),
    timezone: z.string()
  }),
  settings: z.object({
    timezone: z.string(),
    businessHours: z.object({
      schedule: z.record(z.object({
        start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
        end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
        active: z.boolean()
      })),
      holidays: z.array(z.date()),
      overrides: z.record(z.object({
        start: z.string(),
        end: z.string()
      }))
    }),
    notifications: z.object({
      email: z.object({
        enabled: z.boolean(),
        recipients: z.array(z.string().email()),
        preferences: z.record(z.boolean())
      }),
      slack: z.object({
        enabled: z.boolean(),
        webhookUrl: z.string().url().optional(),
        channels: z.record(z.string())
      }),
      inApp: z.object({
        enabled: z.boolean(),
        preferences: z.record(z.boolean())
      })
    }),
    branding: z.object({
      logo: z.string().url().optional(),
      colors: z.record(z.string().regex(/^#[0-9A-F]{6}$/i)),
      fonts: z.record(z.string())
    })
  }),
  aiConfig: z.object({
    models: z.object({
      defaultModel: z.string(),
      temperature: z.number().min(0).max(1),
      maxTokens: z.number().positive().max(8000),
      topP: z.number().min(0).max(1)
    }),
    voice: z.object({
      defaultVoice: z.string(),
      speed: z.number().min(0.5).max(2.0),
      pitch: z.number()
    }),
    prompts: z.object({
      templates: z.record(z.string()),
      variables: z.record(z.string())
    }),
    safety: z.object({
      contentFilter: z.boolean(),
      maxConcurrentCalls: z.number().positive()
    })
  })
});

// Default business hours configuration
const DEFAULT_BUSINESS_HOURS: OrganizationSettings['businessHours'] = {
  schedule: {
    MONDAY: { start: '09:00', end: '17:00', active: true },
    TUESDAY: { start: '09:00', end: '17:00', active: true },
    WEDNESDAY: { start: '09:00', end: '17:00', active: true },
    THURSDAY: { start: '09:00', end: '17:00', active: true },
    FRIDAY: { start: '09:00', end: '17:00', active: true },
    SATURDAY: { start: '09:00', end: '17:00', active: false },
    SUNDAY: { start: '09:00', end: '17:00', active: false }
  },
  holidays: [],
  overrides: {}
};

interface OrganizationFormProps {
  organization?: Organization;
  onSubmit: (data: Organization) => Promise<void>;
  className?: string;
}

const OrganizationForm: React.FC<OrganizationFormProps> = ({
  organization,
  onSubmit,
  className
}) => {
  const { hasPermission } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate AI configuration settings
  const validateAIConfig = useCallback(async (config: OrganizationAIConfig): Promise<boolean> => {
    try {
      // Validate model compatibility
      if (!['gpt-4', 'gpt-3.5-turbo'].includes(config.models.defaultModel)) {
        throw new Error('Unsupported AI model selected');
      }

      // Validate voice configuration
      if (config.voice.speed < 0.5 || config.voice.speed > 2.0) {
        throw new Error('Voice speed must be between 0.5 and 2.0');
      }

      // Validate safety settings
      if (config.safety.maxConcurrentCalls > 100) {
        throw new Error('Maximum concurrent calls exceeded limit');
      }

      return true;
    } catch (error) {
      toast.error(`AI Configuration Error: ${error.message}`);
      return false;
    }
  }, []);

  // Enhanced form submission handler
  const handleSubmit = async (data: Partial<Organization>) => {
    try {
      setIsSubmitting(true);

      // Validate permissions
      if (!hasPermission('ADMIN')) {
        throw new Error('Insufficient permissions to update organization settings');
      }

      // Validate AI configuration
      const isAIValid = await validateAIConfig(data.aiConfig!);
      if (!isAIValid) return;

      // Transform and validate business hours
      const businessHours = data.settings?.businessHours;
      if (businessHours) {
        Object.entries(businessHours.schedule).forEach(([day, schedule]) => {
          if (schedule.active && dayjs(schedule.end).isBefore(dayjs(schedule.start))) {
            throw new Error(`Invalid business hours for ${day}`);
          }
        });
      }

      await onSubmit({
        ...organization,
        ...data,
        updatedAt: new Date()
      } as Organization);

      toast.success('Organization settings updated successfully');
    } catch (error) {
      toast.error(`Failed to update organization settings: ${error.message}`);
      console.error('Organization update error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form
      onSubmit={handleSubmit}
      validationSchema={VALIDATION_SCHEMA}
      initialValues={organization || {
        settings: { businessHours: DEFAULT_BUSINESS_HOURS },
        status: OrganizationStatus.ACTIVE
      }}
      className={className}
      enableAIValidation
    >
      {({ values, errors, touched, handleChange, handleBlur }) => (
        <div className="space-y-8">
          {/* General Information Section */}
          <section className="space-y-4">
            <h2 className={DESIGN_SYSTEM.TYPOGRAPHY.fontSize['2xl']}>General Information</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input
                type="text"
                name="name"
                placeholder="Organization Name"
                onChange={handleChange}
                onBlur={handleBlur}
                value={values.name}
                className={`form-input ${errors.name && touched.name ? 'border-error' : ''}`}
              />
              {/* Additional general fields */}
            </div>
          </section>

          {/* Business Hours Section */}
          <section className="space-y-4">
            <h2 className={DESIGN_SYSTEM.TYPOGRAPHY.fontSize.xl}>Business Hours</h2>
            {Object.entries(values.settings?.businessHours?.schedule || {}).map(([day, schedule]) => (
              <div key={day} className="flex items-center space-x-4">
                <span className="w-24">{day}</span>
                <input
                  type="time"
                  name={`settings.businessHours.schedule.${day}.start`}
                  value={schedule.start}
                  onChange={handleChange}
                  className="form-input"
                />
                <input
                  type="time"
                  name={`settings.businessHours.schedule.${day}.end`}
                  value={schedule.end}
                  onChange={handleChange}
                  className="form-input"
                />
                <input
                  type="checkbox"
                  name={`settings.businessHours.schedule.${day}.active`}
                  checked={schedule.active}
                  onChange={handleChange}
                  className="form-checkbox"
                />
              </div>
            ))}
          </section>

          {/* AI Configuration Section */}
          <section className="space-y-4">
            <h2 className={DESIGN_SYSTEM.TYPOGRAPHY.fontSize.xl}>AI Configuration</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <select
                name="aiConfig.models.defaultModel"
                value={values.aiConfig?.models.defaultModel}
                onChange={handleChange}
                className="form-select"
              >
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
              <input
                type="number"
                name="aiConfig.models.temperature"
                value={values.aiConfig?.models.temperature}
                onChange={handleChange}
                min="0"
                max="1"
                step="0.1"
                className="form-input"
              />
              {/* Additional AI configuration fields */}
            </div>
          </section>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </Form>
  );
};

export default OrganizationForm;