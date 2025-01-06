import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import classNames from 'classnames';
import { useRouter } from 'next/router';
import { User, UserRole } from '../../types/auth';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { useAnalytics } from '../../hooks/useAnalytics';

// Sidebar theme interface
interface SidebarTheme {
  background: string;
  text: string;
  activeBackground: string;
  activeText: string;
  hoverBackground: string;
  borderColor: string;
}

// Props interface
interface SidebarProps {
  user: User | null;
  isCollapsed: boolean;
  onCollapse: () => void;
  className?: string;
  theme?: Partial<SidebarTheme>;
}

// Navigation item interface
interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: UserRole[];
  permissions: string[];
  children?: NavItem[];
}

// Default theme
const defaultTheme: SidebarTheme = {
  background: DESIGN_SYSTEM.COLORS.gray[800],
  text: DESIGN_SYSTEM.COLORS.gray[100],
  activeBackground: DESIGN_SYSTEM.COLORS.primary,
  activeText: DESIGN_SYSTEM.COLORS.gray[50],
  hoverBackground: DESIGN_SYSTEM.COLORS.gray[700],
  borderColor: DESIGN_SYSTEM.COLORS.gray[700]
};

// Navigation items with role-based access
const navigationItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <span className="material-icons">dashboard</span>,
    roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CONTENT_CREATOR, UserRole.ANALYST],
    permissions: ['dashboard.view']
  },
  {
    label: 'Campaigns',
    href: '/campaigns',
    icon: <span className="material-icons">campaign</span>,
    roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CONTENT_CREATOR],
    permissions: ['campaign.view'],
    children: [
      {
        label: 'Active Campaigns',
        href: '/campaigns/active',
        icon: <span className="material-icons">play_circle</span>,
        roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CONTENT_CREATOR],
        permissions: ['campaign.view']
      },
      {
        label: 'Create Campaign',
        href: '/campaigns/create',
        icon: <span className="material-icons">add_circle</span>,
        roles: [UserRole.ADMIN, UserRole.MANAGER],
        permissions: ['campaign.create']
      }
    ]
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: <span className="material-icons">analytics</span>,
    roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.ANALYST],
    permissions: ['analytics.view']
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <span className="material-icons">settings</span>,
    roles: [UserRole.ADMIN],
    permissions: ['settings.manage']
  }
];

const Sidebar: React.FC<SidebarProps> = ({
  user,
  isCollapsed,
  onCollapse,
  className,
  theme: customTheme
}) => {
  const router = useRouter();
  const { trackNavigation } = useAnalytics();
  const sidebarRef = useRef<HTMLElement>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Merge custom theme with default theme
  const theme = { ...defaultTheme, ...customTheme };

  // Filter navigation items based on user role and permissions
  const filterNavItems = useCallback((items: NavItem[]): NavItem[] => {
    if (!user) return [];

    return items.filter(item => {
      const hasRole = item.roles.includes(user.role);
      const hasPermissions = item.permissions.every(p => user.permissions?.includes(p));
      
      if (item.children) {
        item.children = filterNavItems(item.children);
      }
      
      return hasRole && hasPermissions;
    });
  }, [user]);

  // Handle navigation with analytics tracking
  const handleNavigation = useCallback((item: NavItem, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
    }

    trackNavigation({
      path: item.href,
      label: item.label,
      timestamp: new Date().toISOString()
    });

    if (isMobileOpen) {
      setIsMobileOpen(false);
    }

    router.push(item.href);
  }, [router, trackNavigation, isMobileOpen]);

  // Handle item expansion
  const toggleExpanded = useCallback((href: string) => {
    setExpandedItems(prev => 
      prev.includes(href) 
        ? prev.filter(item => item !== href)
        : [...prev, href]
    );
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent, item: NavItem) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNavigation(item);
    }
  }, [handleNavigation]);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMobileOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsMobileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileOpen]);

  // Render navigation items recursively
  const renderNavItems = (items: NavItem[], level = 0) => {
    return filterNavItems(items).map((item) => {
      const isActive = router.pathname === item.href;
      const isExpanded = expandedItems.includes(item.href);
      const hasChildren = item.children && item.children.length > 0;

      return (
        <div key={item.href} className={classNames('nav-item-container', { 'ml-4': level > 0 })}>
          <Link
            href={item.href}
            onClick={(e) => {
              e.preventDefault();
              if (hasChildren) {
                toggleExpanded(item.href);
              } else {
                handleNavigation(item, e);
              }
            }}
            className={classNames(
              'nav-item',
              'flex items-center px-4 py-2 rounded-lg transition-colors duration-200',
              {
                'bg-primary text-white': isActive,
                'hover:bg-gray-700': !isActive,
                'pl-8': level > 0
              }
            )}
            role="menuitem"
            tabIndex={0}
            onKeyDown={(e) => handleKeyDown(e, item)}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="icon-container mr-3">{item.icon}</span>
            {!isCollapsed && (
              <span className="nav-label truncate">{item.label}</span>
            )}
            {hasChildren && !isCollapsed && (
              <span className={`material-icons ml-auto transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            )}
          </Link>
          {hasChildren && isExpanded && !isCollapsed && (
            <div className="nav-children ml-4 mt-1">
              {renderNavItems(item.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <nav
      ref={sidebarRef}
      className={classNames(
        'sidebar',
        'flex flex-col',
        'transition-all duration-300 ease-in-out',
        {
          'w-64': !isCollapsed,
          'w-16': isCollapsed,
          'fixed inset-y-0 left-0 z-50': true,
          'transform -translate-x-full': !isMobileOpen,
          'transform translate-x-0': isMobileOpen
        },
        className
      )}
      style={{ backgroundColor: theme.background }}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-between h-16 px-4 border-b" style={{ borderColor: theme.borderColor }}>
        {!isCollapsed && (
          <span className="text-xl font-semibold" style={{ color: theme.text }}>
            Menu
          </span>
        )}
        <button
          onClick={onCollapse}
          className="p-2 rounded-lg hover:bg-gray-700 transition-colors duration-200"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="material-icons" style={{ color: theme.text }}>
            {isCollapsed ? 'menu_open' : 'menu'}
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div role="menu" className="space-y-1 px-2">
          {renderNavItems(navigationItems)}
        </div>
      </div>

      {/* Mobile toggle button */}
      <button
        className="lg:hidden fixed top-4 left-4 p-2 rounded-lg bg-gray-800 text-white z-50"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMobileOpen}
      >
        <span className="material-icons">
          {isMobileOpen ? 'close' : 'menu'}
        </span>
      </button>
    </nav>
  );
};

export default Sidebar;