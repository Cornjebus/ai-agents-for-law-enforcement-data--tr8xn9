import React, { forwardRef, useEffect, useRef, useCallback } from 'react'; // v18.0+
import { Dialog } from '@headlessui/react'; // v1.7+
import clsx from 'clsx'; // v2.0+
import { DESIGN_SYSTEM } from '../../lib/constants';
import Button from './Button';

/**
 * Props interface for the Modal component with comprehensive type safety
 */
interface ModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback function when modal is closed */
  onClose: () => void;
  /** Modal title for accessibility */
  title: string;
  /** Modal content */
  children: React.ReactNode;
  /** Modal size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Show close button flag */
  showCloseButton?: boolean;
  /** Enable closing on overlay click */
  closeOnOverlayClick?: boolean;
  /** Additional class name for modal container */
  className?: string;
  /** Additional class name for modal header */
  headerClassName?: string;
  /** Additional class name for modal body */
  bodyClassName?: string;
  /** Additional class name for close button */
  closeButtonClassName?: string;
  /** Initial focus element ref */
  initialFocus?: React.RefObject<HTMLElement>;
  /** Callback after modal is fully closed */
  onAfterClose?: () => void;
  /** Close button accessibility label */
  closeButtonLabel?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Custom hook to manage focus trap within modal
 */
function useModalFocus(
  ref: React.RefObject<HTMLDivElement>,
  isOpen: boolean,
  initialFocus?: React.RefObject<HTMLElement>
) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store previously focused element
      previousFocus.current = document.activeElement as HTMLElement;
      
      // Focus initial element or first focusable element
      if (initialFocus?.current) {
        initialFocus.current.focus();
      } else if (ref.current) {
        const firstFocusable = ref.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }
    } else {
      // Restore focus when modal closes
      previousFocus.current?.focus();
    }
  }, [isOpen, initialFocus]);
}

/**
 * A customizable modal dialog component that implements the design system's modal patterns
 * with comprehensive accessibility support and animations
 */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  className,
  headerClassName,
  bodyClassName,
  closeButtonClassName,
  initialFocus,
  onAfterClose,
  closeButtonLabel = 'Close modal',
  testId = 'modal-dialog'
}, ref) => {
  // Modal container ref for focus management
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Handle focus trap
  useModalFocus(containerRef, isOpen, initialFocus);

  // Handle escape key
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      onClose();
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Size-specific styles based on design system
  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  };

  return (
    <Dialog
      as="div"
      open={isOpen}
      onClose={closeOnOverlayClick ? onClose : () => {}}
      className="fixed inset-0 z-50 overflow-y-auto"
      data-testid={testId}
      initialFocus={initialFocus}
      ref={containerRef}
      static
    >
      {/* Backdrop with blur effect */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" />

      {/* Modal container with perfect centering */}
      <div className="fixed inset-0 flex min-h-screen items-center justify-center p-4">
        <Dialog.Panel
          ref={ref}
          className={clsx(
            'relative w-full rounded-lg bg-white shadow-xl',
            'transform transition-all duration-300 ease-out',
            'dark:bg-gray-800',
            sizeStyles[size],
            className
          )}
          style={{
            boxShadow: DESIGN_SYSTEM.SHADOWS.lg,
          }}
        >
          {/* Header */}
          <div
            className={clsx(
              'flex items-center justify-between border-b border-gray-200 p-4',
              'dark:border-gray-700',
              headerClassName
            )}
          >
            <Dialog.Title
              as="h3"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              {title}
            </Dialog.Title>

            {showCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className={clsx('text-gray-500 hover:text-gray-700', closeButtonClassName)}
                aria-label={closeButtonLabel}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </Button>
            )}
          </div>

          {/* Body */}
          <div
            className={clsx(
              'p-4',
              'max-h-[calc(100vh-10rem)] overflow-y-auto',
              bodyClassName
            )}
          >
            {children}
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
});

Modal.displayName = 'Modal';

export default Modal;