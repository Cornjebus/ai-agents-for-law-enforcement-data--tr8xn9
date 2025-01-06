'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';
import classNames from 'classnames';
import { Navigation } from '../../components/shared/Navigation';
import { Sidebar } from '../../components/shared/Sidebar';
import { useAnalytics } from '../../hooks/useAnalytics';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { hasPermission } from '../../lib/auth';
import { UserRole } from '../../types/auth';

// Props interface for the layout component
interface CampaignsLayoutProps {
  children: React.ReactNode;
  className?: string;
}

// Error fallback component
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div 
    role="alert" 
    className="p-4 m-4 bg-red-50 border border-red-200 rounded-lg"
  >
    <h2 className="text-lg font-semibold text-red-700">Something went wrong</h2>
    <p className="text-red-600">{error.message}</p>
  </div>
);

/**
 * Layout component for campaign-related pages with role-based access control
 * and responsive design following design system specifications
 */
const CampaignsLayout: React.FC<CampaignsLayoutProps> = React.memo(({ children, className }) => {
  // State for sidebar collapse
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Get current pathname for active state
  const pathname = usePathname();
  
  // Analytics hook for tracking
  const { trackNavigation } = useAnalytics({
    enableRealTime: true,
    performanceMonitoring: true
  });

  // Check user permissions for campaigns section
  const hasAccess = useMemo(() => {
    return hasPermission(UserRole.CONTENT_CREATOR);
  }, []);

  // Handle sidebar collapse
  const handleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
    // Track sidebar interaction
    trackNavigation({
      path: pathname,
      action: 'sidebar_toggle',
      timestamp: new Date().toISOString()
    });
  }, [pathname, trackNavigation]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '[' && e.ctrlKey) {
        setIsSidebarCollapsed(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Redirect or show error if no access
  if (!hasAccess) {
    return (
      <div 
        role="alert" 
        className="p-8 text-center"
        aria-live="polite"
      >
        <h2 className="text-xl font-semibold text-gray-800">Access Denied</h2>
        <p className="mt-2 text-gray-600">
          You don't have permission to access the campaigns section.
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div 
        className={classNames(
          'min-h-screen bg-gray-50',
          'flex flex-col',
          className
        )}
      >
        {/* Main navigation */}
        <Navigation 
          className="z-30 fixed top-0 left-0 right-0"
          analyticsEnabled={true}
        />

        <div className="flex flex-1 pt-16">
          {/* Sidebar navigation */}
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onCollapse={handleSidebarCollapse}
            className="z-20"
            theme={{
              background: DESIGN_SYSTEM.COLORS.gray[800],
              text: DESIGN_SYSTEM.COLORS.gray[100]
            }}
          />

          {/* Main content area */}
          <main 
            className={classNames(
              'flex-1',
              'transition-all duration-300 ease-in-out',
              'px-4 py-6 sm:px-6 lg:px-8',
              {
                'ml-64': !isSidebarCollapsed,
                'ml-16': isSidebarCollapsed
              }
            )}
            role="main"
            aria-label="Campaign content"
          >
            {/* Content container with max width */}
            <div 
              className={classNames(
                'mx-auto',
                'max-w-7xl',
                'space-y-6'
              )}
            >
              {children}
            </div>
          </main>
        </div>

        {/* Skip to main content link for accessibility */}
        <a
          href="#main"
          className={classNames(
            'sr-only focus:not-sr-only',
            'fixed top-0 left-0 z-50',
            'px-4 py-2 bg-primary text-white',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary'
          )}
        >
          Skip to main content
        </a>
      </div>
    </ErrorBoundary>
  );
});

// Display name for debugging
CampaignsLayout.displayName = 'CampaignsLayout';

export default CampaignsLayout;