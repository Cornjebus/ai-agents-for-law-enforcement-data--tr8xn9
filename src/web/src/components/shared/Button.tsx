import React, { forwardRef } from 'react'; // v18.0+
import clsx from 'clsx'; // v2.0+
import { DESIGN_SYSTEM } from '../../lib/constants';
import { useAnalytics } from '../../hooks/useAnalytics';

/**
 * Comprehensive props interface for the Button component
 */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Content to be rendered inside the button */
  children: React.ReactNode;
  /** Visual style variant of the button */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  /** Size variant of the button */
  size?: 'sm' | 'md' | 'lg';
  /** Loading state indicator */
  isLoading?: boolean;
  /** Disabled state indicator */
  isDisabled?: boolean;
  /** Full width button option */
  fullWidth?: boolean;
  /** Optional icon to display before the content */
  startIcon?: React.ReactElement;
  /** Optional icon to display after the content */
  endIcon?: React.ReactElement;
  /** Optional class name for additional styling */
  className?: string;
}

/**
 * A fully-featured button component with accessibility, analytics, and design system compliance
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  isDisabled = false,
  fullWidth = false,
  startIcon,
  endIcon,
  className,
  onClick,
  type = 'button',
  ...props
}, ref) => {
  const { trackEvent } = useAnalytics();

  // Base styles following design system
  const baseStyles = clsx(
    'inline-flex items-center justify-center rounded-md font-medium transition-all',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed'
  );

  // Variant-specific styles
  const variantStyles = {
    primary: `bg-[${DESIGN_SYSTEM.COLORS.primary}] text-white hover:bg-opacity-90 active:bg-opacity-100
              focus:ring-[${DESIGN_SYSTEM.COLORS.primary}] disabled:bg-opacity-50`,
    secondary: `bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300
                focus:ring-gray-500 disabled:bg-gray-50`,
    outline: `border border-gray-300 bg-transparent hover:bg-gray-50 active:bg-gray-100
              focus:ring-[${DESIGN_SYSTEM.COLORS.primary}] disabled:border-gray-200`,
    ghost: `bg-transparent hover:bg-gray-50 active:bg-gray-100
           focus:ring-gray-500 disabled:bg-transparent`
  };

  // Size-specific styles
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2.5'
  };

  // State-specific styles
  const stateStyles = clsx(
    isLoading && 'cursor-wait opacity-70 pointer-events-none',
    isDisabled && 'opacity-50 pointer-events-none',
    fullWidth && 'w-full'
  );

  // Combine all styles
  const buttonStyles = clsx(
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    stateStyles,
    className
  );

  // Handle click with analytics tracking
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isLoading && !isDisabled && onClick) {
      trackEvent({
        category: 'Button',
        action: 'click',
        label: `${variant}_${size}`,
        value: 1
      });
      onClick(event);
    }
  };

  // Loading spinner component
  const LoadingSpinner = () => (
    <svg
      className="animate-spin -ml-1 mr-2 h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );

  return (
    <button
      ref={ref}
      type={type}
      className={buttonStyles}
      disabled={isDisabled || isLoading}
      onClick={handleClick}
      {...props}
      style={{
        boxShadow: DESIGN_SYSTEM.SHADOWS.sm,
        transition: 'all 150ms ease-in-out'
      }}
      aria-busy={isLoading}
      aria-disabled={isDisabled}
    >
      {isLoading && <LoadingSpinner />}
      {!isLoading && startIcon && (
        <span className="inline-flex shrink-0">{startIcon}</span>
      )}
      <span className={clsx(
        'inline-flex items-center',
        isLoading && 'opacity-90'
      )}>
        {children}
      </span>
      {!isLoading && endIcon && (
        <span className="inline-flex shrink-0">{endIcon}</span>
      )}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;