import React, { useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion'; // v10.0.0
import { IconX, IconCheck, IconInfo, IconAlertTriangle } from '@tabler/icons-react'; // v2.30.0
import { classNames } from '../../lib/utils';

// Toast component props interface with comprehensive configuration
interface ToastProps {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  onDismiss: () => void;
  className?: string;
  isReducedMotion?: boolean;
}

// Custom hook for performance-optimized auto-dismiss functionality
const useToastAutoHide = (duration: number, onDismiss: () => void) => {
  useEffect(() => {
    if (duration <= 0) return;

    let timeoutId: number;
    const startTime = performance.now();

    const dismiss = () => {
      const elapsedTime = performance.now() - startTime;
      if (elapsedTime < duration) {
        timeoutId = requestAnimationFrame(dismiss);
      } else {
        onDismiss();
      }
    };

    timeoutId = requestAnimationFrame(dismiss);

    return () => {
      if (timeoutId) {
        cancelAnimationFrame(timeoutId);
      }
    };
  }, [duration, onDismiss]);
};

// Get toast styles and icon based on type with theme support
const getToastStyles = (type: ToastProps['type'] = 'info') => {
  const styles = {
    info: {
      icon: IconInfo,
      className: 'bg-blue-50 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      role: 'status',
    },
    success: {
      icon: IconCheck,
      className: 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-100',
      role: 'status',
    },
    warning: {
      icon: IconAlertTriangle,
      className: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
      role: 'alert',
    },
    error: {
      icon: IconX,
      className: 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-100',
      role: 'alert',
    },
  };

  return styles[type];
};

// Main toast component with enhanced animations and accessibility
export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = 'info',
  duration = 3000,
  onDismiss,
  className,
  isReducedMotion = false,
}) => {
  // Memoize dismiss handler for performance
  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  // Initialize auto-hide functionality
  useToastAutoHide(duration, handleDismiss);

  // Get styles and icon for current toast type
  const { icon: Icon, className: typeClassName, role } = getToastStyles(type);

  // Animation configuration based on reduced motion preference
  const animationConfig = {
    initial: { opacity: 0, y: 8, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.95 },
    transition: {
      duration: isReducedMotion ? 0 : 0.2,
      ease: 'easeInOut',
    },
  };

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={id}
        {...animationConfig}
        className={classNames(
          'fixed bottom-4 right-4 z-50 max-w-sm mb-2 shadow-lg rounded-lg overflow-hidden',
          'p-4 flex items-center',
          typeClassName,
          className
        )}
        role={role}
        aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
      >
        <Icon 
          className="flex-shrink-0 w-5 h-5 mr-3" 
          aria-hidden="true"
        />
        <p className="text-sm font-medium">{message}</p>
        <button
          type="button"
          className="ml-auto flex-shrink-0 -mr-1 h-5 w-5 opacity-50 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-full transition-opacity"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <IconX className="h-full w-full" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

// Export types for external use
export type { ToastProps };