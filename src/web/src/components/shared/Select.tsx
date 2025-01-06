/**
 * @fileoverview Enterprise-grade select component with comprehensive validation,
 * accessibility features, and design system integration
 * @version 1.0.0
 */

import React, { useCallback, useRef, useEffect } from 'react';
import classNames from 'classnames'; // v2.3.2
import { useForm } from './Form';

// Interfaces
export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  description?: string;
  icon?: React.ReactNode;
}

export interface SelectProps {
  name: string;
  options: SelectOption[];
  label?: string;
  value?: string | number | Array<string | number>;
  placeholder?: string;
  multiple?: boolean;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  className?: string;
  theme?: 'default' | 'primary' | 'secondary';
  validationRules?: Array<{
    rule: (value: any) => boolean;
    message: string;
  }>;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'data-testid'?: string;
  onChange?: (value: string | number | Array<string | number>) => void;
  onBlur?: () => void;
}

// Design system constants
const SELECT_CLASSES = {
  base: 'w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none bg-white transition-colors duration-200',
  error: 'border-error-500 focus:ring-error-500 focus:border-error-500',
  disabled: 'bg-gray-100 cursor-not-allowed opacity-75',
  label: 'block text-sm font-medium text-gray-700 mb-1',
  required: 'text-error-500 ml-1',
  errorText: 'mt-1 text-sm text-error-500',
  icon: 'absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none',
  wrapper: 'relative',
  focus: 'focus:outline-none focus:ring-2',
  hover: 'hover:border-primary-400'
};

/**
 * Enhanced select component with comprehensive validation and accessibility features
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      name,
      options,
      label,
      value,
      placeholder,
      multiple = false,
      disabled = false,
      error,
      required = false,
      className,
      theme = 'default',
      validationRules = [],
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
      'data-testid': dataTestId,
      onChange,
      onBlur,
    },
    ref
  ) => {
    // Refs
    const selectRef = useRef<HTMLSelectElement>(null);
    const errorId = `${name}-error`;
    const descriptionId = `${name}-description`;

    // Form context integration
    const form = useForm();
    const formValue = form?.values[name];
    const formError = form?.errors[name];
    const isInForm = !!form;

    // Merge external and form values
    const currentValue = isInForm ? formValue : value;
    const currentError = error || formError;

    /**
     * Validates the select value against provided rules
     */
    const validateValue = useCallback(
      (valueToValidate: any): string | undefined => {
        for (const { rule, message } of validationRules) {
          if (!rule(valueToValidate)) {
            return message;
          }
        }
        return undefined;
      },
      [validationRules]
    );

    /**
     * Sanitizes input value to prevent XSS
     */
    const sanitizeValue = (inputValue: string | string[]): string | string[] => {
      const sanitize = (val: string) =>
        val.replace(/[<>]/g, '').trim();

      return Array.isArray(inputValue)
        ? inputValue.map(sanitize)
        : sanitize(inputValue);
    };

    /**
     * Enhanced change handler with validation and sanitization
     */
    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = event.target.selectedOptions;
        let newValue: string | string[];

        if (multiple) {
          newValue = Array.from(selectedOptions).map(option => option.value);
        } else {
          newValue = event.target.value;
        }

        // Sanitize input
        const sanitizedValue = sanitizeValue(newValue);

        // Validate value
        const validationError = validateValue(sanitizedValue);

        if (isInForm) {
          form.handleChange(name, sanitizedValue);
          if (validationError) {
            form.setFieldError(name, validationError);
          }
        }

        // Call external onChange
        onChange?.(sanitizedValue);
      },
      [name, multiple, onChange, validateValue, isInForm, form]
    );

    /**
     * Enhanced blur handler with validation state updates
     */
    const handleBlur = useCallback(() => {
      if (isInForm) {
        form.handleBlur(name);
      }
      onBlur?.();
    }, [name, onBlur, isInForm, form]);

    // Focus management
    useEffect(() => {
      if (selectRef.current && !disabled) {
        selectRef.current.focus();
      }
    }, [disabled]);

    return (
      <div className={classNames('select-component', className)}>
        {label && (
          <label
            htmlFor={name}
            className={SELECT_CLASSES.label}
          >
            {label}
            {required && <span className={SELECT_CLASSES.required}>*</span>}
          </label>
        )}

        <div className={SELECT_CLASSES.wrapper}>
          <select
            ref={mergeRefs([ref, selectRef])}
            id={name}
            name={name}
            value={currentValue ?? ''}
            multiple={multiple}
            disabled={disabled}
            required={required}
            className={classNames(
              SELECT_CLASSES.base,
              SELECT_CLASSES[theme],
              {
                [SELECT_CLASSES.error]: !!currentError,
                [SELECT_CLASSES.disabled]: disabled,
              }
            )}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-label={ariaLabel || label}
            aria-invalid={!!currentError}
            aria-required={required}
            aria-describedby={classNames(
              currentError ? errorId : undefined,
              ariaDescribedBy
            )}
            data-testid={dataTestId}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map(option => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                aria-description={option.description}
              >
                {option.label}
              </option>
            ))}
          </select>

          <svg
            className={SELECT_CLASSES.icon}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {currentError && (
          <p
            id={errorId}
            className={SELECT_CLASSES.errorText}
            role="alert"
          >
            {currentError}
          </p>
        )}
      </div>
    );
  }
);

// Utility function to merge refs
const mergeRefs = (refs: Array<React.Ref<any>>) => {
  return (value: any) => {
    refs.forEach(ref => {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref != null) {
        (ref as React.MutableRefObject<any>).current = value;
      }
    });
  };
};

Select.displayName = 'Select';

export default Select;