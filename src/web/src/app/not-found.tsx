'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalytics } from '@vercel/analytics';
import Button from '../components/shared/Button';
import Card from '../components/shared/Card';
import { DESIGN_SYSTEM } from '../lib/constants';

/**
 * Enhanced 404 error page component with accessibility features, analytics tracking,
 * and consistent design system implementation
 */
export default function NotFound() {
  const router = useRouter();
  const { track } = useAnalytics();

  // Track 404 error page view
  useEffect(() => {
    track('404_error', {
      path: window.location.pathname,
      referrer: document.referrer,
      timestamp: new Date().toISOString()
    });
  }, [track]);

  /**
   * Handler for returning to dashboard with analytics tracking
   */
  const handleReturnHome = () => {
    track('404_return_home', {
      path: window.location.pathname,
      timestamp: new Date().toISOString()
    });
    router.push('/dashboard');
  };

  return (
    <main 
      className="min-h-screen flex items-center justify-center p-4 bg-gray-50"
      role="main"
      aria-labelledby="error-title"
    >
      <Card
        variant="default"
        padding="lg"
        className="max-w-md w-full text-center"
        role="alert"
        aria-live="polite"
      >
        <div className="space-y-6">
          {/* Error Icon */}
          <div className="mx-auto w-16 h-16 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
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

          {/* Error Title */}
          <h1
            id="error-title"
            className={`text-2xl font-bold text-gray-900 font-[${DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary}]`}
          >
            Page Not Found
          </h1>

          {/* Error Message */}
          <p 
            className={`text-gray-600 text-base leading-relaxed font-[${DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary}]`}
          >
            We couldn't find the page you're looking for. Please check the URL or return to the dashboard.
          </p>

          {/* Action Button */}
          <div className="mt-6">
            <Button
              variant="primary"
              size="lg"
              onClick={handleReturnHome}
              className="w-full sm:w-auto"
              aria-label="Return to dashboard"
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}