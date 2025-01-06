'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import classNames from 'classnames';
import { Navigation } from '../../components/shared/Navigation';
import { Sidebar } from '../../components/shared/Sidebar';
import { useAuth } from '@auth/core';
import { UserRole } from '../../types/auth';
import { DESIGN_SYSTEM } from '../../lib/constants';

// Props interface for Settings Layout
interface SettingsLayoutProps {
  children: React.ReactNode;
}

// Settings navigation items with role-based access
const SETTINGS_SECTIONS = [
  {
    id: 'profile',
    label: 'Profile Settings',
    icon: 'person',
    requiredRole: UserRole.ANALYST,
    path: '/settings/profile'
  },
  {
    id: 'organization',
    label: 'Organization',
    icon: 'business',
    requiredRole: UserRole.MANAGER,
    path: '/settings/organization'
  },
  {
    id: 'team',
    label: 'Team Management',
    icon: 'group',
    requiredRole: UserRole.MANAGER,
    path: '/settings/team'
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'integration_instructions',
    requiredRole: UserRole.ADMIN,
    path: '/settings/integrations'
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'security',
    requiredRole: UserRole.ADMIN,
    path: '/settings/security'
  },
  {
    id: 'billing',
    label: 'Billing & Subscription',
    icon: 'payment',
    requiredRole: UserRole.MANAGER,
    path: '/settings/billing'
  }
];

const SettingsLayout: React.FC<SettingsLayoutProps> = ({ children }) => {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < DESIGN_SYSTEM.BREAKPOINTS.tablet);
      if (window.innerWidth < DESIGN_SYSTEM.BREAKPOINTS.tablet) {
        setSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    // Load sidebar state from localStorage
    const savedState = localStorage.getItem('settings_sidebar_collapsed');
    if (savedState) {
      setSidebarCollapsed(JSON.parse(savedState));
    }

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle authentication and role-based access
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login?returnUrl=/settings');
      return;
    }

    if (user && !SETTINGS_SECTIONS.some(section => 
      user.role >= section.requiredRole
    )) {
      router.push('/dashboard');
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Handle sidebar collapse
  const handleSidebarCollapse = useCallback(() => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('settings_sidebar_collapsed', JSON.stringify(newState));
  }, [sidebarCollapsed]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div 
          className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"
          role="progressbar"
          aria-label="Loading settings"
        />
      </div>
    );
  }

  // Authenticated layout with role-based access
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Main Navigation */}
      <Navigation
        user={user}
        onLogout={() => {/* Handled by Navigation component */}}
        className="fixed top-0 left-0 right-0 z-50"
      />

      {/* Settings Sidebar */}
      <Sidebar
        user={user}
        isCollapsed={sidebarCollapsed}
        onCollapse={handleSidebarCollapse}
        className={classNames(
          'fixed left-0 top-16 bottom-0',
          'transition-all duration-300 ease-in-out',
          'border-r border-gray-200',
          {
            'w-64': !sidebarCollapsed,
            'w-16': sidebarCollapsed
          }
        )}
        theme={{
          background: DESIGN_SYSTEM.COLORS.gray[50],
          text: DESIGN_SYSTEM.COLORS.gray[700],
          activeBackground: DESIGN_SYSTEM.COLORS.primary,
          activeText: DESIGN_SYSTEM.COLORS.gray[50],
          hoverBackground: DESIGN_SYSTEM.COLORS.gray[100],
          borderColor: DESIGN_SYSTEM.COLORS.gray[200]
        }}
      />

      {/* Main Content */}
      <main
        className={classNames(
          'flex-1 transition-all duration-300 ease-in-out',
          'pt-16 pb-8',
          {
            'ml-64': !sidebarCollapsed && !isMobileView,
            'ml-16': sidebarCollapsed || isMobileView
          }
        )}
        role="main"
        aria-label="Settings content"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb for accessibility */}
          <nav className="mb-4" aria-label="Breadcrumb">
            <ol className="flex text-sm text-gray-500">
              <li>
                <span>Settings</span>
                <span className="mx-2">/</span>
              </li>
              <li aria-current="page" className="text-gray-900 font-medium">
                {SETTINGS_SECTIONS.find(section => 
                  router.pathname.includes(section.path)
                )?.label || 'Overview'}
              </li>
            </ol>
          </nav>

          {/* Page content */}
          <div 
            className={classNames(
              'bg-white rounded-lg shadow',
              'p-6 md:p-8',
              'min-h-[calc(100vh-12rem)]'
            )}
          >
            {children}
          </div>
        </div>
      </main>

      {/* Mobile overlay */}
      {!sidebarCollapsed && isMobileView && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 transition-opacity"
          aria-hidden="true"
          onClick={handleSidebarCollapse}
        />
      )}
    </div>
  );
};

export default SettingsLayout;