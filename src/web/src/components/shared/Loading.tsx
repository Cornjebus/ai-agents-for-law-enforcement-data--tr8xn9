/**
 * A reusable loading spinner component providing visual feedback during async operations
 * Implements WCAG 2.1 AA compliant loading states with proper ARIA attributes
 * @version 1.0.0
 */

import React from 'react'; // v18.0.0
import { classNames } from '../../lib/utils';

/**
 * Props interface for the Loading component
 */
interface LoadingProps {
  /** Size variant of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant of the spinner */
  variant?: 'primary' | 'secondary';
  /** Optional additional CSS classes */
  className?: string;
  /** Optional full screen overlay mode */
  fullScreen?: boolean;
  /** Optional custom accessibility label */
  ariaLabel?: string;
}

/**
 * Size mappings for the spinner component
 */
const SIZES = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12'
} as const;

/**
 * Color variant mappings for the spinner component
 */
const VARIANTS = {
  primary: 'text-primary-600 dark:text-primary-400',
  secondary: 'text-gray-600 dark:text-gray-400'
} as const;

/**
 * Base animation classes for smooth performance
 */
const ANIMATION_CLASSES = 'animate-spin transition-transform';

/**
 * Loading spinner component that provides visual feedback during async operations
 */
const Loading = React.memo(({
  size = 'md',
  variant = 'primary',
  className,
  fullScreen = false,
  ariaLabel = 'Loading content'
}: LoadingProps): JSX.Element => {
  // Generate memoized class names
  const spinnerClasses = classNames(
    SIZES[size],
    VARIANTS[variant],
    ANIMATION_CLASSES,
    className
  );

  // SVG spinner with proper ARIA attributes
  const spinner = (
    <svg
      className={spinnerClasses}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="progressbar"
      aria-label={ariaLabel}
      aria-busy="true"
      aria-live="polite"
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
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  // Return full screen overlay if enabled
  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm transition-opacity"
        role="alert"
        aria-label={ariaLabel}
      >
        {spinner}
      </div>
    );
  }

  // Return standalone spinner
  return spinner;
});

// Display name for debugging
Loading.displayName = 'Loading';

export default Loading;