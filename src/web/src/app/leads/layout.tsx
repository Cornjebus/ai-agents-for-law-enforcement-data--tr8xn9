'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigation } from '../../../components/shared/Navigation';
import { Sidebar } from '../../../components/shared/Sidebar';
import { useAnalytics } from '../../../hooks/useAnalytics';
import { DESIGN_SYSTEM } from '../../../lib/constants';
import { UserRole } from '../../../types/auth';

// Layout props interface
interface LeadsLayoutProps {
  children: React.ReactNode;
  className?: string;
}

// Error fallback component
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
    <div className="text-error text-lg font-semibold mb-2">Error loading leads section</div>
    <div className="text-gray-600 mb-4">{error.message}</div>
    <button 
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
    >
      Retry
    </button>
  </div>
);

/**
 * Layout component for the leads management section
 * Implements role-based access control, responsive design, and accessibility features
 */
const LeadsLayout: React.FC<LeadsLayoutProps> = ({ children, className }) => {
  const router = useRouter();
  const { trackNavigation } = useAnalytics();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [user, setUser] = useState(null);

  // Handle sidebar collapse state
  const handleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
    // Store preference in localStorage
    localStorage.setItem('sidebar_collapsed', (!isSidebarCollapsed).toString());
  }, [isSidebarCollapsed]);

  // Initialize layout state
  useEffect(() => {
    // Restore sidebar state
    const savedState = localStorage.getItem('sidebar_collapsed');
    if (savedState) {
      setIsSidebarCollapsed(savedState === 'true');
    }

    // Track page view
    trackNavigation({
      path: '/leads',
      label: 'Leads Section',
      timestamp: new Date().toISOString()
    });
  }, [trackNavigation]);

  // Verify user permissions
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const authState = await import('../../../lib/auth').then(m => m.getAuthState());
        if (!authState.isAuthenticated) {
          router.push('/login');
          return;
        }

        const hasAccess = await import('../../../lib/auth').then(m => 
          m.hasPermission(UserRole.CONTENT_CREATOR)
        );

        if (!hasAccess) {
          router.push('/unauthorized');
          return;
        }

        setUser(authState.user);
      } catch (error) {
        console.error('Error checking access:', error);
        router.push('/error');
      }
    };

    checkAccess();
  }, [router]);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        console.error('Leads layout error:', error);
        // Log error to analytics
        window.dispatchEvent(new CustomEvent('layout-error', {
          detail: { section: 'leads', error: error.message }
        }));
      }}
    >
      <div className={classNames(
        'flex min-h-screen bg-gray-50',
        className
      )}>
        {/* Sidebar navigation */}
        <Sidebar
          user={user}
          isCollapsed={isSidebarCollapsed}
          onCollapse={handleSidebarCollapse}
          className="border-r border-gray-200"
          theme={{
            background: DESIGN_SYSTEM.COLORS.gray[50],
            text: DESIGN_SYSTEM.COLORS.gray[900],
            activeBackground: DESIGN_SYSTEM.COLORS.primary,
            activeText: DESIGN_SYSTEM.COLORS.gray[50]
          }}
        />

        {/* Main content area */}
        <div className={classNames(
          'flex-1 transition-all duration-300',
          {
            'ml-64': !isSidebarCollapsed,
            'ml-16': isSidebarCollapsed
          }
        )}>
          {/* Top navigation */}
          <Navigation
            user={user}
            onLogout={() => router.push('/logout')}
            className="border-b border-gray-200"
            analyticsEnabled={true}
          />

          {/* Main content */}
          <main
            className="p-6"
            role="main"
            aria-label="Leads management section"
          >
            {/* Breadcrumb navigation */}
            <nav
              className="mb-4"
              aria-label="Breadcrumb"
            >
              <ol className="flex items-center space-x-2 text-sm text-gray-500">
                <li>
                  <a href="/dashboard" className="hover:text-primary">Dashboard</a>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="material-icons text-gray-400 text-sm">
                    chevron_right
                  </span>
                  <span className="text-gray-900">Leads</span>
                </li>
              </ol>
            </nav>

            {/* Page content */}
            <div
              className="bg-white rounded-lg shadow-sm"
              role="region"
              aria-label="Leads content"
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default LeadsLayout;