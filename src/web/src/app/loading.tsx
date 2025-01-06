'use client';

import React from 'react'; // v18.0.0
import Loading from '../components/shared/Loading';

/**
 * Next.js 13+ app directory loading component that provides a full-screen loading state
 * during route transitions and data fetching operations.
 * Implements WCAG 2.1 AA compliant loading states with proper ARIA attributes.
 * @returns {JSX.Element} Full-screen loading spinner component
 */
export default function LoadingPage(): JSX.Element {
  return (
    <Loading
      size="lg"
      variant="primary"
      fullScreen={true}
      ariaLabel="Loading page content"
      className="transition-all duration-300 ease-in-out"
    />
  );
}