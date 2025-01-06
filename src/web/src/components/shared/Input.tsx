/**
 * @fileoverview Enterprise-grade input component with advanced validation, security,
 * and accessibility features. Implements WCAG 2.1 AA compliance and AI-driven validation.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames'; // v2.3.2
import { ValidationService } from '@validation/service'; // v1.0.0
import { useForm } from './Form';
import debounce from 'lodash/debounce'; // v4.17.21

// Input style classes following design system
const INPUT_CLASSES = {
  base: 'w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200',
  error: 'border-error-500 focus:ring-error-500 focus:border-error-500',
  success: 'border-success-500 focus:ring-success-500 focus:border-success-500',
  warning: 'border-warning-500 focus:ring-warning-500 focus:border-warning-500',
  disabled: 'bg-gray-100 cursor-not-allowed opacity-75',
  label: 'block text-sm font-medium text-gray-700 mb-1',
  errorText: 'mt-1 text-sm text-error-500',
  securityIndicator: 'absolute right-2 top-2',
  validationSpinner: 'absolute right-2 top-2 animate-spin',
  accessibilityHint: 'sr-only'
};

// Validation debounce delay
const VALIDATION_DELAY = 300;

// Security level configuration
type SecurityLevel = 'low' | 'medium' | 'high';
type ValidationMode = 'standard' | 'ai' | 'enhanced';

// Accessibility configuration interface
interface AccessibilityConfig {
  ariaLabel?: string;
  ariaDescribedBy?: string;
  role?: string;
  autoComplete?: string;
  focusOnMount?: boolean;
}

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  message?: string;
  securityWarnings?: string[];
}

// Input component props
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url';
  securityLevel?: SecurityLevel;
  validationMode?: ValidationMode;
  accessibilityConfig?: AccessibilityConfig;
  error?: string;
  showSecurityIndicator?: boolean;
}

/**
 * Enhanced input component with advanced validation, security, and accessibility features
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      name,
      label,
      type = 'text',
      securityLevel = 'medium',
      validationMode = 'standard',
      accessibilityConfig,
      error,
      showSecurityIndicator = true,
      className,
      onChange,
      onBlur,
      disabled,
      value,
      ...props
    },
    ref
  ) => {
    // Internal state
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<ValidationResult>({ isValid: true });
    const [securityStatus, setSecurityStatus] = useState<'safe' | 'warning' | 'danger'>('safe');
    
    // Refs
    const inputRef = useRef<HTMLInputElement>(null);
    const validationService = useRef(new ValidationService());
    
    // Form context
    const { setFieldValue, setFieldError } = useForm();

    // Initialize accessibility features
    useEffect(() => {
      if (accessibilityConfig?.focusOnMount && inputRef.current) {
        inputRef.current.focus();
      }
    }, [accessibilityConfig?.focusOnMount]);

    /**
     * Enhanced validation with security checks and AI support
     */
    const validateInput = useCallback(
      async (value: string): Promise<ValidationResult> => {
        if (!value) return { isValid: true };

        try {
          const validationOptions = {
            securityLevel,
            validationMode,
            type
          };

          const result = await validationService.current.validateData(
            value,
            validationOptions
          );

          // Update security status based on validation results
          if (result.securityWarnings?.length) {
            setSecurityStatus(result.securityWarnings.length > 1 ? 'danger' : 'warning');
          } else {
            setSecurityStatus('safe');
          }

          return result;
        } catch (error) {
          console.error('Validation error:', error);
          return {
            isValid: false,
            message: 'Validation failed',
            securityWarnings: ['Validation system error']
          };
        }
      },
      [securityLevel, validationMode, type]
    );

    /**
     * Debounced validation handler
     */
    const debouncedValidation = useCallback(
      debounce(async (value: string) => {
        setIsValidating(true);
        const result = await validateInput(value);
        setValidationResult(result);
        
        if (!result.isValid) {
          setFieldError(name, result.message || 'Invalid input');
        }
        
        setIsValidating(false);
      }, VALIDATION_DELAY),
      [validateInput, name, setFieldError]
    );

    /**
     * Enhanced change handler with validation
     */
    const handleChange = useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        setFieldValue(name, newValue);
        
        if (onChange) {
          onChange(event);
        }

        // Trigger validation
        debouncedValidation(newValue);
      },
      [onChange, setFieldValue, name, debouncedValidation]
    );

    /**
     * Enhanced blur handler with final validation
     */
    const handleBlur = useCallback(
      async (event: React.FocusEvent<HTMLInputElement>) => {
        const finalValue = event.target.value;
        const result = await validateInput(finalValue);
        setValidationResult(result);

        if (onBlur) {
          onBlur(event);
        }
      },
      [onBlur, validateInput]
    );

    // Compute input classes
    const inputClasses = classNames(
      INPUT_CLASSES.base,
      {
        [INPUT_CLASSES.error]: error || !validationResult.isValid,
        [INPUT_CLASSES.success]: !error && validationResult.isValid && value,
        [INPUT_CLASSES.disabled]: disabled
      },
      className
    );

    return (
      <div className="relative">
        {label && (
          <label htmlFor={name} className={INPUT_CLASSES.label}>
            {label}
          </label>
        )}
        
        <div className="relative">
          <input
            ref={mergeRefs([inputRef, ref])}
            id={name}
            type={type}
            name={name}
            disabled={disabled}
            className={inputClasses}
            onChange={handleChange}
            onBlur={handleBlur}
            value={value}
            aria-invalid={!!error || !validationResult.isValid}
            aria-describedby={`${name}-error ${name}-security`}
            {...accessibilityConfig}
            {...props}
          />

          {showSecurityIndicator && (
            <div 
              id={`${name}-security`}
              className={INPUT_CLASSES.securityIndicator}
              role="status"
              aria-live="polite"
            >
              {isValidating ? (
                <span className={INPUT_CLASSES.validationSpinner}>⌛</span>
              ) : (
                <SecurityIndicator status={securityStatus} />
              )}
            </div>
          )}
        </div>

        {(error || !validationResult.isValid) && (
          <div 
            id={`${name}-error`}
            className={INPUT_CLASSES.errorText}
            role="alert"
          >
            {error || validationResult.message}
          </div>
        )}

        {/* Screen reader only validation status */}
        <div className={INPUT_CLASSES.accessibilityHint} role="status">
          {isValidating ? 'Validating input...' : 
            validationResult.isValid ? 'Input is valid' : 'Input has errors'}
        </div>
      </div>
    );
  }
);

Input.displayName = 'Input';

// Helper function to merge refs
function mergeRefs<T>(refs: Array<React.Ref<T>>): React.Ref<T> {
  return (value: T) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref) {
        (ref as React.MutableRefObject<T>).current = value;
      }
    });
  };
}

// Security indicator component
const SecurityIndicator: React.FC<{ status: 'safe' | 'warning' | 'danger' }> = ({ status }) => {
  const icons = {
    safe: '✓',
    warning: '⚠',
    danger: '⛔'
  };

  return (
    <span
      className={classNames('text-sm', {
        'text-success-500': status === 'safe',
        'text-warning-500': status === 'warning',
        'text-error-500': status === 'danger'
      })}
      aria-label={`Security status: ${status}`}
    >
      {icons[status]}
    </span>
  );
};

export default Input;