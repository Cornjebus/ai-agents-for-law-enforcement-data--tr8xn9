import React, { useEffect, useCallback } from 'react';
import { IconX, IconCheck, IconInfo, IconAlertTriangle } from '@tabler/icons-react'; // v2.30.0
import { classNames } from '../../lib/utils';

// Alert component props interface with comprehensive accessibility support
interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
  autoDismissTimeout?: number;
  customIcon?: React.ReactNode;
}

// Style configuration based on alert type with accessibility considerations
const getAlertStyles = (type: AlertProps['type'] = 'info') => {
  const baseStyles = 'flex items-start p-4 rounded-lg transition-all duration-200';
  const iconBaseStyles = 'flex-shrink-0 w-5 h-5 mr-3 mt-0.5';

  const styles = {
    info: {
      container: 'bg-blue-50 text-blue-800 focus-within:ring-2 focus-within:ring-blue-500',
      icon: <IconInfo className={classNames(iconBaseStyles, 'text-blue-500')} aria-hidden="true" />,
      role: 'status'
    },
    success: {
      container: 'bg-green-50 text-green-800 focus-within:ring-2 focus-within:ring-green-500',
      icon: <IconCheck className={classNames(iconBaseStyles, 'text-green-500')} aria-hidden="true" />,
      role: 'status'
    },
    warning: {
      container: 'bg-yellow-50 text-yellow-800 focus-within:ring-2 focus-within:ring-yellow-500',
      icon: <IconAlertTriangle className={classNames(iconBaseStyles, 'text-yellow-500')} aria-hidden="true" />,
      role: 'alert'
    },
    error: {
      container: 'bg-red-50 text-red-800 focus-within:ring-2 focus-within:ring-red-500',
      icon: <IconAlertTriangle className={classNames(iconBaseStyles, 'text-red-500')} aria-hidden="true" />,
      role: 'alert'
    }
  };

  return {
    containerClassName: classNames(baseStyles, styles[type].container),
    icon: styles[type].icon,
    role: styles[type].role
  };
};

// Custom hook for handling auto-dismiss functionality
const useAutoDismiss = (timeout: number | undefined, onDismiss: (() => void) | undefined) => {
  const [isPaused, setIsPaused] = React.useState(false);

  useEffect(() => {
    if (!timeout || !onDismiss || isPaused) return;

    const timeoutId = setTimeout(() => {
      onDismiss();
    }, timeout);

    return () => clearTimeout(timeoutId);
  }, [timeout, onDismiss, isPaused]);

  const handlers = {
    onMouseEnter: () => setIsPaused(true),
    onMouseLeave: () => setIsPaused(false),
    onFocus: () => setIsPaused(true),
    onBlur: () => setIsPaused(false)
  };

  return handlers;
};

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  className,
  autoDismissTimeout,
  customIcon
}) => {
  // Generate unique IDs for accessibility
  const titleId = React.useId();
  const contentId = React.useId();

  // Get styles and accessibility attributes based on type
  const { containerClassName, icon, role } = getAlertStyles(type);

  // Handle auto-dismiss functionality
  const autoDismissHandlers = useAutoDismiss(autoDismissTimeout, onDismiss);

  // Handle keyboard-accessible dismiss
  const handleDismiss = useCallback((event?: React.KeyboardEvent | React.MouseEvent) => {
    if (
      event &&
      'key' in event &&
      event.key !== 'Enter' &&
      event.key !== ' ' &&
      event.key !== 'Escape'
    ) {
      return;
    }
    onDismiss?.();
  }, [onDismiss]);

  // Handle escape key for dismissal
  useEffect(() => {
    if (!dismissible || !onDismiss) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [dismissible, onDismiss]);

  return (
    <div
      className={classNames(containerClassName, className)}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={contentId}
      {...autoDismissHandlers}
    >
      {/* Alert Icon */}
      {customIcon || icon}

      {/* Alert Content */}
      <div className="flex-1">
        <h3 id={titleId} className="text-sm font-medium mb-1">
          {title}
        </h3>
        <div id={contentId} className="text-sm">
          {children}
        </div>
      </div>

      {/* Dismiss Button */}
      {dismissible && onDismiss && (
        <button
          type="button"
          className="flex-shrink-0 ml-3 -mr-1 -mt-1 p-1 rounded-full hover:bg-opacity-20 hover:bg-black focus:outline-none focus:ring-2 focus:ring-offset-1"
          onClick={handleDismiss}
          onKeyDown={handleDismiss}
          aria-label="Dismiss alert"
        >
          <IconX className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

// Export type for external usage
export type { AlertProps };