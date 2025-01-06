/**
 * @fileoverview Enterprise-grade React form component for lead management with AI integration
 * Features real-time validation, accessibility support, and enhanced security measures
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { z } from 'zod'; // v3.22.0
import { Form, useForm, FormField } from '../shared/Form';
import { ILead, LeadStatus, LeadSource, LeadScore } from '../../types/lead';
import { LeadService } from '../../services/lead.service';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { handleApiError } from '../../lib/api';

// Lead form validation schema with security patterns
const LEAD_FORM_VALIDATION_SCHEMA = z.object({
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .regex(/^[a-zA-Z\s-']+$/, 'Invalid characters in first name'),
  
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .regex(/^[a-zA-Z\s-']+$/, 'Invalid characters in last name'),
  
  email: z.string()
    .email('Invalid email format')
    .max(100, 'Email cannot exceed 100 characters'),
  
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  
  company: z.string()
    .min(1, 'Company name is required')
    .max(100, 'Company name cannot exceed 100 characters'),
  
  title: z.string()
    .max(100, 'Title cannot exceed 100 characters'),
  
  status: z.nativeEnum(LeadStatus),
  source: z.nativeEnum(LeadSource),
  
  metadata: z.object({
    industry: z.string().optional(),
    companySize: z.string().optional(),
    budget: z.string().optional(),
    timeline: z.string().optional(),
    technographics: z.array(z.string()).optional(),
    socialProfiles: z.object({
      linkedin: z.string().url('Invalid LinkedIn URL').optional(),
      twitter: z.string().url('Invalid Twitter URL').optional(),
      other: z.record(z.string()).optional()
    }).optional()
  })
});

// Form field configuration with accessibility support
const FORM_FIELD_CONFIG = {
  firstName: {
    label: 'First Name',
    placeholder: 'Enter first name',
    autoComplete: 'given-name',
    required: true,
    'aria-required': true
  },
  lastName: {
    label: 'Last Name',
    placeholder: 'Enter last name',
    autoComplete: 'family-name',
    required: true,
    'aria-required': true
  },
  email: {
    label: 'Email',
    type: 'email',
    placeholder: 'Enter email address',
    autoComplete: 'email',
    required: true,
    'aria-required': true
  },
  phone: {
    label: 'Phone',
    type: 'tel',
    placeholder: 'Enter phone number',
    autoComplete: 'tel',
    required: true,
    'aria-required': true
  },
  company: {
    label: 'Company',
    placeholder: 'Enter company name',
    autoComplete: 'organization',
    required: true,
    'aria-required': true
  },
  title: {
    label: 'Job Title',
    placeholder: 'Enter job title',
    autoComplete: 'organization-title'
  }
};

// Props interface for LeadForm component
interface LeadFormProps {
  initialData?: Partial<ILead>;
  onSubmit: (lead: ILead) => Promise<void>;
  onCancel: () => void;
  aiEnabled?: boolean;
}

/**
 * Enhanced lead form component with AI integration and security measures
 */
const LeadForm: React.FC<LeadFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  aiEnabled = true
}) => {
  const [aiScore, setAiScore] = useState<LeadScore | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form with validation schema
  const form = useForm({
    validationSchema: LEAD_FORM_VALIDATION_SCHEMA,
    initialValues: initialData || {},
    enableAIValidation: aiEnabled
  });

  // Fetch AI score when form values change
  useEffect(() => {
    const fetchAIScore = async () => {
      if (!aiEnabled || !form.values.email) return;
      
      try {
        const score = await LeadService.getAIScore({
          email: form.values.email,
          company: form.values.company,
          metadata: form.values.metadata
        });
        setAiScore(score);
      } catch (error) {
        console.error('AI scoring error:', error);
      }
    };

    const debounceTimer = setTimeout(fetchAIScore, 500);
    return () => clearTimeout(debounceTimer);
  }, [form.values, aiEnabled]);

  // Enhanced form submission handler with security measures
  const handleSubmit = useCallback(async (data: typeof form.values) => {
    setIsSubmitting(true);
    setFormError(null);

    try {
      // Validate form data
      await LeadService.validateLeadData(data);

      // Create or update lead
      const leadData: ILead = {
        ...data,
        aiScore: aiScore || { overall: 0, engagement: 0, intent: 0, budget: 0, lastUpdated: new Date() },
        status: data.status || LeadStatus.NEW,
        source: data.source || LeadSource.WEBSITE,
        createdAt: initialData?.createdAt || new Date(),
        updatedAt: new Date()
      };

      await onSubmit(leadData);
    } catch (error) {
      const apiError = handleApiError(error);
      setFormError(apiError.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [aiScore, initialData, onSubmit]);

  return (
    <Form
      onSubmit={handleSubmit}
      className="lead-form"
      enableAIValidation={aiEnabled}
      accessibilityConfig={{
        ariaLabel: 'Lead Information Form',
        focusOnMount: true,
        keyboardNavigation: true
      }}
    >
      <div className="form-grid">
        {/* Personal Information Section */}
        <div className="form-section">
          <h3 className="section-title">Personal Information</h3>
          <div className="field-group">
            <FormField
              name="firstName"
              {...FORM_FIELD_CONFIG.firstName}
            />
            <FormField
              name="lastName"
              {...FORM_FIELD_CONFIG.lastName}
            />
          </div>
        </div>

        {/* Contact Information Section */}
        <div className="form-section">
          <h3 className="section-title">Contact Information</h3>
          <div className="field-group">
            <FormField
              name="email"
              {...FORM_FIELD_CONFIG.email}
            />
            <FormField
              name="phone"
              {...FORM_FIELD_CONFIG.phone}
            />
          </div>
        </div>

        {/* Company Information Section */}
        <div className="form-section">
          <h3 className="section-title">Company Information</h3>
          <div className="field-group">
            <FormField
              name="company"
              {...FORM_FIELD_CONFIG.company}
            />
            <FormField
              name="title"
              {...FORM_FIELD_CONFIG.title}
            />
          </div>
        </div>

        {/* AI Score Display */}
        {aiEnabled && aiScore && (
          <div className="ai-score-section" role="region" aria-label="AI Lead Score">
            <h3 className="section-title">AI Lead Score</h3>
            <div className="score-grid">
              <div className="score-item">
                <label>Overall Score</label>
                <span className="score">{aiScore.overall}%</span>
              </div>
              <div className="score-item">
                <label>Engagement</label>
                <span className="score">{aiScore.engagement}%</span>
              </div>
              <div className="score-item">
                <label>Intent</label>
                <span className="score">{aiScore.intent}%</span>
              </div>
              <div className="score-item">
                <label>Budget Fit</label>
                <span className="score">{aiScore.budget}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Form Error Display */}
        {formError && (
          <div 
            className="form-error" 
            role="alert" 
            aria-live="polite"
          >
            {formError}
          </div>
        )}

        {/* Form Actions */}
        <div className="form-actions">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : initialData ? 'Update Lead' : 'Create Lead'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .lead-form {
          padding: ${DESIGN_SYSTEM.SPACING.lg}px;
          background: ${DESIGN_SYSTEM.COLORS.gray[50]};
          border-radius: 8px;
        }

        .form-grid {
          display: grid;
          gap: ${DESIGN_SYSTEM.SPACING.md}px;
        }

        .form-section {
          margin-bottom: ${DESIGN_SYSTEM.SPACING.md}px;
        }

        .section-title {
          font-size: ${DESIGN_SYSTEM.TYPOGRAPHY.fontSize.lg};
          font-weight: ${DESIGN_SYSTEM.TYPOGRAPHY.fontWeight.semibold};
          margin-bottom: ${DESIGN_SYSTEM.SPACING.sm}px;
          color: ${DESIGN_SYSTEM.COLORS.gray[900]};
        }

        .field-group {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: ${DESIGN_SYSTEM.SPACING.md}px;
        }

        .ai-score-section {
          background: ${DESIGN_SYSTEM.COLORS.gray[100]};
          padding: ${DESIGN_SYSTEM.SPACING.md}px;
          border-radius: 6px;
        }

        .score-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: ${DESIGN_SYSTEM.SPACING.sm}px;
        }

        .score-item {
          text-align: center;
        }

        .score {
          display: block;
          font-size: ${DESIGN_SYSTEM.TYPOGRAPHY.fontSize.xl};
          font-weight: ${DESIGN_SYSTEM.TYPOGRAPHY.fontWeight.bold};
          color: ${DESIGN_SYSTEM.COLORS.primary};
        }

        .form-error {
          padding: ${DESIGN_SYSTEM.SPACING.sm}px;
          background: ${DESIGN_SYSTEM.COLORS.error};
          color: white;
          border-radius: 4px;
          margin-top: ${DESIGN_SYSTEM.SPACING.sm}px;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: ${DESIGN_SYSTEM.SPACING.sm}px;
          margin-top: ${DESIGN_SYSTEM.SPACING.lg}px;
        }
      `}</style>
    </Form>
  );
};

export default LeadForm;