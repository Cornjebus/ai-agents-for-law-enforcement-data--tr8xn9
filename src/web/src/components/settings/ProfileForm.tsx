/**
 * @fileoverview Enterprise-grade profile form component with enhanced security,
 * accessibility, and real-time validation features.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { z } from 'zod'; // v3.22.0
import { useAriaForm } from 'react-aria'; // v3.5.0
import { useA11y } from '@accessibility/hooks'; // v1.0.0
import { SecurityContext } from '@auth/security-context'; // v1.0.0
import Form from '../shared/Form';
import Input from '../shared/Input';

// Enhanced validation schema with security rules
const PROFILE_VALIDATION_SCHEMA = z.object({
  firstName: z.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .regex(/^[a-zA-Z\s-']+$/, 'First name contains invalid characters'),
  lastName: z.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .regex(/^[a-zA-Z\s-']+$/, 'Last name contains invalid characters'),
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters'),
  securityToken: z.string()
    .min(32, 'Invalid security token')
});

// Security configuration for form protection
const SECURITY_CONFIG = {
  encryptionLevel: 'AES-256-GCM',
  tokenValidityDuration: 300, // 5 minutes
  maxAttempts: 3,
  sensitiveFields: ['firstName', 'lastName', 'email']
};

// Accessibility configuration for WCAG 2.1 AA compliance
const ACCESSIBILITY_CONFIG = {
  ariaLabels: {
    form: 'Profile update form',
    firstName: 'First name input field',
    lastName: 'Last name input field',
    email: 'Email address input field'
  },
  focusManagement: {
    initialFocus: 'firstName',
    trapFocus: true,
    restoreFocus: true
  },
  announcements: {
    success: 'Profile updated successfully',
    error: 'Error updating profile. Please try again.',
    validation: 'Please correct the form errors before submitting.'
  }
};

// Profile form props interface
interface ProfileFormProps {
  onSubmit: (data: ProfileFormData) => Promise<void>;
  initialData?: Partial<ProfileFormData>;
  className?: string;
  securityLevel: SecurityLevel;
  validationMode?: ValidationMode;
}

// Profile form data interface
interface ProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
  securityToken: string;
}

/**
 * Enhanced profile form component with security and accessibility features
 */
const ProfileForm: React.FC<ProfileFormProps> = ({
  onSubmit,
  initialData,
  className,
  securityLevel,
  validationMode = 'enhanced'
}) => {
  // Refs and context
  const formRef = useRef<HTMLFormElement>(null);
  const securityContext = React.useContext(SecurityContext);
  
  // Accessibility hooks
  const { ariaProps, announceMessage } = useA11y(ACCESSIBILITY_CONFIG);
  const { formProps } = useAriaForm({
    ...ACCESSIBILITY_CONFIG.focusManagement
  });

  // Initialize security token
  useEffect(() => {
    securityContext.generateToken({
      duration: SECURITY_CONFIG.tokenValidityDuration,
      purpose: 'profile-update'
    });
  }, [securityContext]);

  /**
   * Enhanced form submission handler with security checks
   */
  const handleSubmit = useCallback(async (data: ProfileFormData) => {
    try {
      // Validate security token
      if (!securityContext.verifyToken(data.securityToken)) {
        throw new Error('Invalid security token');
      }

      // Encrypt sensitive data
      const encryptedData = await Promise.all(
        SECURITY_CONFIG.sensitiveFields.map(async (field) => ({
          [field]: await securityContext.encryptField(data[field])
        }))
      );

      // Submit encrypted data
      await onSubmit({
        ...data,
        ...Object.assign({}, ...encryptedData)
      });

      announceMessage(ACCESSIBILITY_CONFIG.announcements.success);
    } catch (error) {
      announceMessage(ACCESSIBILITY_CONFIG.announcements.error);
      console.error('Profile update error:', error);
    }
  }, [onSubmit, securityContext, announceMessage]);

  /**
   * Real-time field validation handler
   */
  const handleValidation = useCallback(async (fieldName: string, value: any) => {
    try {
      const fieldSchema = PROFILE_VALIDATION_SCHEMA.shape[fieldName];
      await fieldSchema.parseAsync(value);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        message: error instanceof z.ZodError ? error.errors[0].message : 'Validation failed'
      };
    }
  }, []);

  return (
    <Form
      ref={formRef}
      onSubmit={handleSubmit}
      validationSchema={PROFILE_VALIDATION_SCHEMA}
      initialValues={initialData}
      className={className}
      securityLevel={securityLevel}
      {...formProps}
      {...ariaProps}
    >
      <Input
        name="firstName"
        label="First Name"
        type="text"
        securityLevel={securityLevel}
        validationMode={validationMode}
        accessibilityConfig={{
          ariaLabel: ACCESSIBILITY_CONFIG.ariaLabels.firstName,
          autoComplete: 'given-name'
        }}
        required
      />

      <Input
        name="lastName"
        label="Last Name"
        type="text"
        securityLevel={securityLevel}
        validationMode={validationMode}
        accessibilityConfig={{
          ariaLabel: ACCESSIBILITY_CONFIG.ariaLabels.lastName,
          autoComplete: 'family-name'
        }}
        required
      />

      <Input
        name="email"
        label="Email Address"
        type="email"
        securityLevel={securityLevel}
        validationMode={validationMode}
        accessibilityConfig={{
          ariaLabel: ACCESSIBILITY_CONFIG.ariaLabels.email,
          autoComplete: 'email'
        }}
        required
      />

      <input
        type="hidden"
        name="securityToken"
        value={securityContext.currentToken}
      />

      <button
        type="submit"
        className="btn btn-primary"
        aria-label="Update profile"
      >
        Update Profile
      </button>
    </Form>
  );
};

export default ProfileForm;