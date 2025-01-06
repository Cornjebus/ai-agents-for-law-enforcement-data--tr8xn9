'use client';

import React, { useEffect, useState, useCallback } from 'react';
import classNames from 'classnames';
import { useRouter } from 'next/navigation';
import Navigation from '../../components/shared/Navigation';
import Sidebar from '../../components/shared/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { SecurityMonitor } from '@security/monitor';

// Props interface for the layout component
interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Security monitor configuration
const securityMonitor = new SecurityMonitor({
  monitorInterval: 30000, // 30 seconds
  alertThreshold: 3,
  reportingEndpoint: '/api/security/events'
});

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  // Core hooks
  const router = useRouter();
  const { isAuthenticated, user, loading, logout, securityStatus } = useAuth();
  const analytics = useAnalytics();

  // Local state
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  /**
   * Handle secure logout with analytics and cleanup
   */
  const handleLogout = useCallback(async () => {
    try {
      // Track logout event
      analytics.trackNavigation({
        path: '/logout',
        label: 'User Logout',
        timestamp: new Date().toISOString()
      });

      // Perform secure logout
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      securityMonitor.reportEvent('logout_error', { error: error.message });
    }
  }, [logout, router, analytics]);

  /**
   * Handle sidebar collapse state with persistence
   */
  const handleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebar_collapsed', String(newState));
      return newState;
    });
  }, []);

  /**
   * Initialize responsive behavior and security monitoring
   */
  useEffect(() => {
    // Restore sidebar state
    const savedState = localStorage.getItem('sidebar_collapsed');
    if (savedState) {
      setSidebarCollapsed(savedState === 'true');
    }

    // Setup responsive behavior
    const handleResize = () => {
      setIsMobileView(window.innerWidth < DESIGN_SYSTEM.BREAKPOINTS.tablet);
      if (window.innerWidth < DESIGN_SYSTEM.BREAKPOINTS.tablet) {
        setSidebarCollapsed(true);
      }
    };

    // Initial check
    handleResize();
    window.addEventListener('resize', handleResize);

    // Initialize security monitoring
    securityMonitor.startMonitoring();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      securityMonitor.stopMonitoring();
    };
  }, []);

  /**
   * Authentication and loading states
   */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main navigation */}
      <Navigation
        user={user}
        onLogout={handleLogout}
        className="fixed top-0 left-0 right-0 z-50"
        analyticsEnabled={true}
      />

      {/* Sidebar navigation */}
      <Sidebar
        user={user}
        isCollapsed={isSidebarCollapsed}
        onCollapse={handleSidebarCollapse}
        className={classNames(
          'fixed left-0 top-16 bottom-0',
          'transition-all duration-300 ease-in-out',
          {
            'translate-x-0': !isMobileView || !isSidebarCollapsed,
            '-translate-x-full': isMobileView && isSidebarCollapsed
          }
        )}
      />

      {/* Main content area */}
      <main
        className={classNames(
          'transition-all duration-300 ease-in-out',
          'pt-16 min-h-screen',
          {
            'ml-64': !isSidebarCollapsed && !isMobileView,
            'ml-16': isSidebarCollapsed && !isMobileView,
            'ml-0': isMobileView
          }
        )}
        role="main"
        aria-label="Dashboard content"
      >
        {/* Security status indicator */}
        {securityStatus.failedAttempts > 0 && (
          <div 
            className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" 
            role="alert"
          >
            <p className="font-bold">Security Alert</p>
            <p>Unusual activity detected. Please contact support if this wasn't you.</p>
          </div>
        )}

        {/* Page content */}
        <div className="p-6">
          {children}
        </div>
      </main>

      {/* Accessibility skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white p-4 z-50"
      >
        Skip to main content
      </a>
    </div>
  );
};

export default DashboardLayout;