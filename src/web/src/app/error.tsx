'use client';

import React, { useEffect, useState } from 'react';
import * as Sentry from '@sentry/browser';
import { Alert } from '../components/shared/Alert';
import { Button } from '../components/shared/Button';
import { classNames } from '../lib/utils';
import { DESIGN_SYSTEM } from '../lib/constants';

// Error retry configuration
const RETRY_DELAY = 2000; // 2 seconds
const MAX_RETRIES = 3;
const ERROR_TRACKING_PREFIX = 'error_';

interface ErrorPageProps {
  error: Error;
  reset: () => void;
  errorId?: string;
}

/**
 * Enhanced error page component with comprehensive error tracking,
 * accessibility support, and recovery options
 */
export default function Error({ error, reset, errorId }: ErrorPageProps) {
  // Track loading state for retry action
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Initialize error tracking and monitoring
  useEffect(() => {
    const trackingId = errorId || `${ERROR_TRACKING_PREFIX}${Date.now()}`;
    
    // Log error to Sentry with additional context
    Sentry.captureException(error, {
      tags: {
        errorId: trackingId,
        retryCount: retryCount.toString(),
        errorType: error.name,
      },
      extra: {
        errorMessage: error.message,
        stackTrace: error.stack,
        componentStack: (error as any).componentStack,
      },
    });

    // Format user-friendly error message
    const userMessage = error.message && error.message.length < 100
      ? error.message
      : 'An unexpected error occurred. Our team has been notified.';
    setErrorMessage(userMessage);
  }, [error, errorId, retryCount]);

  // Handle retry action with rate limiting
  const handleRetry = async () => {
    if (isRetrying || retryCount >= MAX_RETRIES) return;

    setIsRetrying(true);
    setRetryCount(prev => prev + 1);

    try {
      // Track retry attempt
      Sentry.addBreadcrumb({
        category: 'retry',
        message: `Retry attempt ${retryCount + 1}`,
        level: 'info',
      });

      // Delay retry to prevent rapid retries
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      reset();
    } catch (retryError) {
      Sentry.captureException(retryError, {
        tags: { retryAttempt: retryCount.toString() },
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      className={classNames(
        'min-h-[400px] flex flex-col items-center justify-center p-4',
        'text-center max-w-2xl mx-auto'
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* Error Icon */}
      <div className="mb-6">
        <svg
          className="w-16 h-16 text-red-500 mx-auto"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      {/* Error Alert */}
      <Alert
        type="error"
        title="Error"
        className="mb-6"
      >
        <p className="text-sm text-red-800">
          {errorMessage}
          {errorId && (
            <span className="block mt-1 text-xs opacity-75">
              Error ID: {errorId}
            </span>
          )}
        </p>
      </Alert>

      {/* Recovery Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          variant="primary"
          onClick={handleRetry}
          isLoading={isRetrying}
          isDisabled={retryCount >= MAX_RETRIES}
          aria-label="Try again"
        >
          {retryCount >= MAX_RETRIES ? 'Too many retries' : 'Try again'}
        </Button>

        <Button
          variant="outline"
          onClick={() => window.location.href = '/'}
          aria-label="Return to dashboard"
        >
          Return to Dashboard
        </Button>
      </div>

      {/* Additional Help */}
      {retryCount >= MAX_RETRIES && (
        <p 
          className={classNames(
            'mt-6 text-sm text-gray-600',
            'max-w-md mx-auto'
          )}
        >
          If this issue persists, please contact our support team or try again later.
        </p>
      )}

      {/* Technical Details (for development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 text-left w-full">
          <details
            className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg"
          >
            <summary className="cursor-pointer font-medium">
              Technical Details
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">
              {error.stack}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}