import React, { useState, useEffect, useMemo, useCallback } from 'react';
import classNames from 'classnames'; // v2.3.0
import { useMediaQuery } from '@mui/material'; // v5.x.x
import { Navigation } from '../../components/shared/Navigation';
import { Sidebar } from '../../components/shared/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { DESIGN_SYSTEM } from '../../lib/constants';

// Props interface for the layout component
interface ContentLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Content Layout component providing secure, accessible, and responsive page structure
 * Implements role-based access control and design system specifications
 */
const ContentLayout: React.FC<ContentLayoutProps> = React.memo(({ children, className }) => {
  // Authentication state management
  const { isAuthenticated, user, loading } = useAuth();

  // Responsive breakpoint detection
  const isMobile = useMediaQuery(`(max-width: ${DESIGN_SYSTEM.BREAKPOINTS.tablet}px)`);
  const isTablet = useMediaQuery(`(max-width: ${DESIGN_SYSTEM.BREAKPOINTS.desktop}px)`);

  // Sidebar collapse state management with persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('sidebar_collapsed');
      return stored ? JSON.parse(stored) : isTablet;
    } catch {
      return isTablet;
    }
  });

  // Handle sidebar collapse state
  const handleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const newState = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', JSON.stringify(newState));
      } catch (error) {
        console.error('Error saving sidebar state:', error);
      }
      return newState;
    });
  }, []);

  // Update sidebar state on breakpoint changes
  useEffect(() => {
    if (isTablet && !isSidebarCollapsed) {
      setIsSidebarCollapsed(true);
    }
  }, [isTablet, isSidebarCollapsed]);

  // Compute layout classes based on sidebar and responsive states
  const layoutClasses = useMemo(() => {
    return classNames(
      'content-layout',
      'min-h-screen',
      'bg-gray-50',
      'transition-all duration-300 ease-in-out',
      {
        'pl-64': !isSidebarCollapsed && !isMobile,
        'pl-16': isSidebarCollapsed && !isMobile,
        'pl-0': isMobile,
      },
      className
    );
  }, [isSidebarCollapsed, isMobile, className]);

  // Content area classes
  const contentClasses = useMemo(() => {
    return classNames(
      'content-area',
      'px-4 py-6',
      'sm:px-6 lg:px-8',
      'transition-all duration-300'
    );
  }, []);

  // Loading state handling
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // Authentication check
  if (!isAuthenticated) {
    // Redirect will be handled by the auth system
    return null;
  }

  return (
    <div className={layoutClasses}>
      {/* Main navigation */}
      <Navigation
        user={user}
        onLogout={() => {}} // Handled by Navigation component
        className="fixed top-0 right-0 left-0 z-20"
        analyticsEnabled={true}
      />

      {/* Sidebar navigation */}
      <Sidebar
        user={user}
        isCollapsed={isSidebarCollapsed}
        onCollapse={handleSidebarCollapse}
        className="fixed left-0 top-16 bottom-0 z-10"
        theme={{
          background: DESIGN_SYSTEM.COLORS.gray[800],
          text: DESIGN_SYSTEM.COLORS.gray[100]
        }}
      />

      {/* Main content area */}
      <main
        className={contentClasses}
        style={{ marginTop: '4rem' }}
        role="main"
        aria-label="Content area"
      >
        {/* Error boundary could be added here */}
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Accessibility skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50"
      >
        Skip to main content
      </a>
    </div>
  );
});

ContentLayout.displayName = 'ContentLayout';

export default ContentLayout;