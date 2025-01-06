import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion'; // v10.0.0
import { classNames } from '../../lib/utils';
import { Alert, AlertProps } from './Alert';

// Props interface for the Notification component
export interface NotificationProps {
  id: string;
  title: string;
  message: React.ReactNode;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  onDismiss: () => void;
  className?: string;
  disableAnimation?: boolean;
}

// Animation variants for notification transitions
const variants = {
  initial: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: { duration: 0.2 }
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: { duration: 0.15 }
  }
};

// Custom hook for auto-hiding notifications
const useNotificationAutoHide = (
  duration: number | undefined,
  onDismiss: () => void
) => {
  useEffect(() => {
    if (!duration || duration <= 0) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [duration, onDismiss]);
};

// Main Notification component
export const Notification: React.FC<NotificationProps> = ({
  id,
  title,
  message,
  type = 'info',
  duration = 5000,
  onDismiss,
  className,
  disableAnimation = false
}) => {
  // Handle auto-dismiss functionality
  useNotificationAutoHide(duration, onDismiss);

  // Base component without animations for reduced motion preference
  const NotificationContent = (
    <Alert
      type={type}
      title={title}
      dismissible={true}
      onDismiss={onDismiss}
      className={classNames(
        'w-full shadow-lg dark:shadow-gray-800',
        className
      )}
      autoDismissTimeout={0} // We handle auto-dismiss separately
    >
      {message}
    </Alert>
  );

  // If animations are disabled, render without AnimatePresence
  if (disableAnimation) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-4 right-4 z-50 max-w-sm sm:max-w-md"
      >
        {NotificationContent}
      </div>
    );
  }

  // Render with animations
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 max-w-sm sm:max-w-md"
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={id}
          layout
          initial="initial"
          animate="animate"
          exit="exit"
          variants={variants}
          layoutRoot
          className="mb-2"
        >
          {NotificationContent}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// Export types for external usage
export type { NotificationProps };