import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import classNames from 'classnames';
import { User, UserRole } from '../../types/auth';
import { UI_CONSTANTS } from '../../lib/constants';
import { useAnalytics } from '../../hooks/useAnalytics';

// Navigation item interface
interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  requiredRole: UserRole;
  ariaLabel: string;
}

// Props interface
interface NavigationProps {
  user: User | null;
  onLogout: () => void;
  className?: string;
  analyticsEnabled?: boolean;
}

// Base navigation items with role requirements
const BASE_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'chart-bar',
    requiredRole: UserRole.ANALYST,
    ariaLabel: 'Navigate to dashboard'
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    path: '/campaigns',
    icon: 'megaphone',
    requiredRole: UserRole.CONTENT_CREATOR,
    ariaLabel: 'Manage campaigns'
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    icon: 'chart-pie',
    requiredRole: UserRole.ANALYST,
    ariaLabel: 'View analytics'
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'cog',
    requiredRole: UserRole.MANAGER,
    ariaLabel: 'Access settings'
  }
];

export const Navigation: React.FC<NavigationProps> = ({
  user,
  onLogout,
  className,
  analyticsEnabled = true
}) => {
  // Refs for accessibility and focus management
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { trackNavigation } = useAnalytics();

  // Memoized filtered navigation items based on user role
  const navigationItems = useMemo(() => {
    if (!user) return [];
    
    return BASE_NAVIGATION_ITEMS.filter(item => {
      const userRoleLevel = UI_CONSTANTS.RBAC_CONFIG[user.role];
      const requiredRoleLevel = UI_CONSTANTS.RBAC_CONFIG[item.requiredRole];
      return userRoleLevel >= requiredRoleLevel;
    });
  }, [user]);

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Enhanced navigation handler with analytics
  const handleNavigation = useCallback((path: string, label: string) => {
    if (analyticsEnabled) {
      trackNavigation({
        path,
        label,
        userId: user?.id,
        timestamp: new Date().toISOString()
      });
    }

    // Announce route change for screen readers
    const announcement = `Navigating to ${label}`;
    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.textContent = announcement;
    document.body.appendChild(announcer);
    setTimeout(() => document.body.removeChild(announcer), 1000);

    setIsMobileMenuOpen(false);
  }, [analyticsEnabled, trackNavigation, user]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  }, []);

  // Focus trap for mobile menu
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleFocusTrap = (event: KeyboardEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        event.preventDefault();
        const firstFocusable = navRef.current?.querySelector('a, button') as HTMLElement;
        firstFocusable?.focus();
      }
    };

    document.addEventListener('focus', handleFocusTrap, true);
    return () => document.removeEventListener('focus', handleFocusTrap, true);
  }, [isMobileMenuOpen]);

  return (
    <nav
      ref={navRef}
      className={classNames(
        'navigation',
        'fixed top-0 left-0 w-full bg-white shadow-md z-50',
        'transition-all duration-200 ease-in-out',
        className
      )}
      role="navigation"
      aria-label="Main navigation"
      onKeyDown={handleKeyDown}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and brand */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/dashboard" className="text-2xl font-bold text-primary">
              <span className="sr-only">Return to dashboard</span>
              ARGP
            </Link>
          </div>

          {/* Desktop navigation */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            {navigationItems.map(item => (
              <Link
                key={item.id}
                href={item.path}
                className={classNames(
                  'inline-flex items-center px-3 py-2 rounded-md text-sm font-medium',
                  'transition-colors duration-150 ease-in-out',
                  'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary'
                )}
                onClick={() => handleNavigation(item.path, item.label)}
                aria-label={item.ariaLabel}
              >
                <i className={`icon-${item.icon} mr-2`} aria-hidden="true" />
                {item.label}
              </Link>
            ))}

            {/* User menu */}
            {user && (
              <div className="ml-4 relative flex items-center">
                <button
                  className="flex items-center space-x-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  onClick={onLogout}
                  aria-label="Log out"
                >
                  <span className="hidden md:block">{user.firstName}</span>
                  <i className="icon-logout" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              ref={menuButtonRef}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label="Open main menu"
            >
              <span className="sr-only">
                {isMobileMenuOpen ? 'Close main menu' : 'Open main menu'}
              </span>
              <i
                className={`icon-${isMobileMenuOpen ? 'x' : 'menu'}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        className={classNames(
          'md:hidden',
          'transition-all duration-200 ease-in-out',
          {
            'block': isMobileMenuOpen,
            'hidden': !isMobileMenuOpen
          }
        )}
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="mobile-menu-button"
      >
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navigationItems.map(item => (
            <Link
              key={item.id}
              href={item.path}
              className={classNames(
                'block px-3 py-2 rounded-md text-base font-medium',
                'transition-colors duration-150 ease-in-out',
                'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary'
              )}
              onClick={() => handleNavigation(item.path, item.label)}
              role="menuitem"
              aria-label={item.ariaLabel}
            >
              <i className={`icon-${item.icon} mr-2`} aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;