'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAnalytics } from '@analytics/react';
import { Navigation } from '../../components/shared/Navigation';
import { Sidebar } from '../../components/shared/Sidebar';
import { UserRole } from '../../types/auth';
import { MetricType } from '../../types/analytics';
import { ANALYTICS_CONFIG, DESIGN_SYSTEM } from '../../lib/constants';

// Performance monitoring thresholds
const PERFORMANCE_THRESHOLDS = {
  apiLatency: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY],
  voiceProcessingTime: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.VOICE_PROCESSING_TIME],
  aiEfficiency: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.AI_EFFICIENCY]
};

// Props interface for the layout component
interface AnalyticsLayoutProps {
  children: React.ReactNode;
  role: UserRole;
  performanceThresholds?: typeof PERFORMANCE_THRESHOLDS;
}

/**
 * Analytics section layout component with real-time updates and role-based access
 */
const AnalyticsLayout: React.FC<AnalyticsLayoutProps> = ({
  children,
  role,
  performanceThresholds = PERFORMANCE_THRESHOLDS
}) => {
  // WebSocket connection reference
  const socketRef = useRef<Socket | null>(null);
  const { trackNavigation } = useAnalytics();

  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  // Performance monitoring state
  const [performanceMetrics, setPerformanceMetrics] = React.useState({
    apiLatency: 0,
    voiceProcessingTime: 0,
    aiEfficiency: 0
  });

  /**
   * Initialize WebSocket connection for real-time updates
   */
  const initializeWebSocket = useCallback(() => {
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || ''}/analytics`;
    socketRef.current = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socketRef.current.on('connect', () => {
      console.log('Analytics WebSocket connected');
    });

    socketRef.current.on('performance_update', (metrics) => {
      setPerformanceMetrics(prev => ({
        ...prev,
        ...metrics
      }));

      // Check performance thresholds
      Object.entries(metrics).forEach(([key, value]) => {
        if (value > performanceThresholds[key as keyof typeof performanceThresholds]) {
          window.dispatchEvent(new CustomEvent('analytics-performance-alert', {
            detail: {
              metric: key,
              value,
              threshold: performanceThresholds[key as keyof typeof performanceThresholds],
              timestamp: Date.now()
            }
          }));
        }
      });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [performanceThresholds]);

  // Initialize WebSocket on mount
  useEffect(() => {
    const cleanup = initializeWebSocket();
    return () => {
      cleanup();
      socketRef.current = null;
    };
  }, [initializeWebSocket]);

  // Handle navigation tracking
  const handleNavigation = useCallback((path: string) => {
    trackNavigation({
      path,
      section: 'analytics',
      timestamp: new Date().toISOString()
    });
  }, [trackNavigation]);

  // Verify user role access
  if (![UserRole.ADMIN, UserRole.MANAGER, UserRole.ANALYST].includes(role)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Access Denied
          </h2>
          <p className="text-gray-600">
            You don't have permission to access the analytics section.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        user={{ role } as any}
        isCollapsed={isSidebarCollapsed}
        onCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className="border-r border-gray-200"
        theme={{
          background: DESIGN_SYSTEM.COLORS.gray[50],
          text: DESIGN_SYSTEM.COLORS.gray[800]
        }}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top navigation */}
        <Navigation
          user={{ role } as any}
          onLogout={() => {}}
          className="border-b border-gray-200"
          analyticsEnabled={true}
        />

        {/* Performance monitoring banner */}
        {Object.entries(performanceMetrics).some(
          ([key, value]) => value > performanceThresholds[key as keyof typeof performanceThresholds]
        ) && (
          <div className="bg-yellow-50 border-b border-yellow-100 px-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-yellow-700">
                <span className="font-medium">Performance Alert:</span> Some metrics are above threshold
              </p>
              <button
                className="text-yellow-700 hover:text-yellow-600"
                aria-label="View performance details"
              >
                <span className="material-icons text-xl">warning</span>
              </button>
            </div>
          </div>
        )}

        {/* Main content */}
        <main 
          className="flex-1 overflow-y-auto bg-gray-50 p-6"
          role="main"
          aria-label="Analytics content"
        >
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AnalyticsLayout;