/**
 * @fileoverview Enterprise-grade form component with advanced validation, accessibility,
 * and security features including AI-driven validation support
 * @version 1.0.0
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import classNames from 'classnames'; // v2.3.2
import { z } from 'zod'; // v3.22.0
import { useFormState } from '@react-aria/form'; // v3.0.0
import { useAIValidation } from '@company/ai-validation'; // v1.0.0
import { useAccessibility } from '@react-aria/utils'; // v3.0.0
import { validateEmail } from '../../lib/validation';

// Security level enum for form protection
enum SecurityLevel {
  BASIC = 'BASIC',
  ENHANCED = 'ENHANCED',
  MAXIMUM = 'MAXIMUM'
}

// Accessibility configuration interface
interface AccessibilityConfig {
  ariaLabel?: string;
  ariaDescribedBy?: string;
  role?: string;
  autoComplete?: string;
  focusOnMount?: boolean;
  keyboardNavigation?: boolean;
}

// Form context value interface
interface FormContextValue {
  values: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
  handleChange: (name: string, value: any) => void;
  handleBlur: (name: string) => void;
  setFieldValue: (name: string, value: any) => void;
  setFieldError: (name: string, error: string) => void;
  validateField: (name: string, value: any) => Promise<void>;
}

// Form props interface
interface FormProps {
  children: React.ReactNode;
  onSubmit: (data: any) => void | Promise<void>;
  validationSchema?: z.ZodSchema;
  initialValues?: Record<string, any>;
  className?: string;
  enableAIValidation?: boolean;
  securityLevel?: SecurityLevel;
  accessibilityConfig?: AccessibilityConfig;
}

// Default form style classes
const FORM_CLASSES = {
  base: 'form-component',
  error: 'form-error',
  success: 'form-success',
  loading: 'form-loading',
  disabled: 'form-disabled'
};

// Create form context
const FormContext = React.createContext<FormContextValue | undefined>(undefined);

/**
 * Enhanced form component with advanced validation, accessibility, and security features
 */
const Form: React.FC<FormProps> = ({
  children,
  onSubmit,
  validationSchema,
  initialValues = {},
  className,
  enableAIValidation = false,
  securityLevel = SecurityLevel.ENHANCED,
  accessibilityConfig = {}
}) => {
  // Refs and state
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hooks
  const { formProps } = useFormState({});
  const { aiValidate } = useAIValidation();
  const { accessibilityProps } = useAccessibility(accessibilityConfig);

  // Initialize form with accessibility focus
  useEffect(() => {
    if (accessibilityConfig.focusOnMount && formRef.current) {
      const firstInput = formRef.current.querySelector('input, select, textarea');
      if (firstInput instanceof HTMLElement) {
        firstInput.focus();
      }
    }
  }, [accessibilityConfig.focusOnMount]);

  /**
   * Enhanced field validation with AI support and security checks
   */
  const validateField = useCallback(async (name: string, value: any) => {
    try {
      // Schema validation
      if (validationSchema) {
        const schema = z.object({ [name]: validationSchema.shape[name] });
        await schema.parseAsync({ [name]: value });
      }

      // AI validation if enabled
      if (enableAIValidation) {
        const aiResult = await aiValidate(name, value);
        if (!aiResult.isValid) {
          throw new Error(aiResult.error);
        }
      }

      // Security validation based on security level
      if (securityLevel >= SecurityLevel.ENHANCED) {
        // Enhanced security checks
        if (typeof value === 'string') {
          if (value.includes('<script') || value.includes('javascript:')) {
            throw new Error('Potential security threat detected');
          }
        }
      }

      // Clear error if validation passes
      setErrors(prev => ({ ...prev, [name]: '' }));
    } catch (error) {
      setErrors(prev => ({ 
        ...prev, 
        [name]: error instanceof Error ? error.message : 'Validation failed'
      }));
    }
  }, [validationSchema, enableAIValidation, securityLevel, aiValidate]);

  /**
   * Handle form field changes with validation
   */
  const handleChange = useCallback(async (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
    if (touched[name]) {
      await validateField(name, value);
    }
  }, [touched, validateField]);

  /**
   * Handle field blur events
   */
  const handleBlur = useCallback((name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    validateField(name, values[name]);
  }, [values, validateField]);

  /**
   * Enhanced form submission handler with security checks
   */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate all fields
      if (validationSchema) {
        await validationSchema.parseAsync(values);
      }

      // Security checks
      if (securityLevel === SecurityLevel.MAXIMUM) {
        // Additional security validation
        Object.entries(values).forEach(([key, value]) => {
          if (typeof value === 'string') {
            if (value.length > 10000) {
              throw new Error(`Field ${key} exceeds maximum allowed length`);
            }
          }
        });
      }

      // Submit form data
      await onSubmit(values);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path) {
            newErrors[err.path[0]] = err.message;
          }
        });
        setErrors(newErrors);
      } else {
        console.error('Form submission error:', error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form context value
  const contextValue: FormContextValue = {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    setFieldValue: (name: string, value: any) => handleChange(name, value),
    setFieldError: (name: string, error: string) => 
      setErrors(prev => ({ ...prev, [name]: error })),
    validateField
  };

  return (
    <FormContext.Provider value={contextValue}>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={classNames(FORM_CLASSES.base, className, {
          [FORM_CLASSES.loading]: isSubmitting,
          [FORM_CLASSES.error]: Object.keys(errors).length > 0
        })}
        {...formProps}
        {...accessibilityProps}
        noValidate
      >
        {children}
      </form>
    </FormContext.Provider>
  );
};

// Export form component and context
export default Form;
export { FormContext, SecurityLevel };
export type { FormProps, FormContextValue, AccessibilityConfig };