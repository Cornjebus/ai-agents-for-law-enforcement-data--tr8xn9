import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import Table from '../shared/Table';
import { useVoice } from '../../hooks/useVoice';
import { IVoiceCall, VoiceCallStatus } from '../../types/voice';
import { ANALYTICS_CONFIG } from '../../lib/constants';

interface CallHistoryProps {
  className?: string;
  pageSize?: number;
  showMetrics?: boolean;
  refreshInterval?: number;
  performanceThreshold?: number;
}

const CallHistory: React.FC<CallHistoryProps> = ({
  className = '',
  pageSize = 10,
  showMetrics = true,
  refreshInterval = 5000,
  performanceThreshold = 200
}) => {
  // Custom hook for voice functionality
  const { calls, metrics, performance } = useVoice();
  
  // Local state for sorting and filtering
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc' | null;
  }>({ key: 'startTime', direction: 'desc' });

  // Format duration in a human-readable way
  const formatDuration = useCallback((seconds: number): string => {
    if (!seconds) return '0s';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
  }, []);

  // Get status color based on call status and performance
  const getStatusColor = useCallback((status: VoiceCallStatus, latency: number): string => {
    const baseClasses = 'px-2 py-1 rounded-full text-sm font-medium text-center';
    
    // Performance-based coloring
    if (latency > performanceThreshold * 1.5) {
      return `${baseClasses} bg-red-100 text-red-800`;
    }
    if (latency > performanceThreshold) {
      return `${baseClasses} bg-yellow-100 text-yellow-800`;
    }

    // Status-based coloring
    switch (status) {
      case VoiceCallStatus.COMPLETED:
        return `${baseClasses} bg-green-100 text-green-800`;
      case VoiceCallStatus.IN_PROGRESS:
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case VoiceCallStatus.FAILED:
        return `${baseClasses} bg-red-100 text-red-800`;
      case VoiceCallStatus.CANCELLED:
        return `${baseClasses} bg-gray-100 text-gray-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-600`;
    }
  }, [performanceThreshold]);

  // Table columns configuration
  const columns = [
    {
      key: 'startTime',
      title: 'Date & Time',
      sortable: true,
      render: (value: Date) => format(new Date(value), 'MMM d, yyyy HH:mm:ss')
    },
    {
      key: 'phoneNumber',
      title: 'Phone Number',
      sortable: true
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value: VoiceCallStatus, row: IVoiceCall) => (
        <div className={getStatusColor(value, row.metrics.latency[0]?.value || 0)}>
          {value}
        </div>
      )
    },
    {
      key: 'duration',
      title: 'Duration',
      sortable: true,
      render: (value: number) => formatDuration(value)
    },
    {
      key: 'metrics',
      title: 'Performance',
      sortable: true,
      render: (metrics: any) => (
        <div className="space-y-1">
          <div className="text-sm">
            Latency: 
            <span className={
              metrics.latency[0]?.value > performanceThreshold 
                ? 'text-red-600 font-medium' 
                : 'text-green-600 font-medium'
            }>
              {` ${metrics.latency[0]?.value || 0}ms`}
            </span>
          </div>
          <div className="text-sm">
            MOS: 
            <span className={
              metrics.mos[0]?.value < 4.0
                ? 'text-yellow-600 font-medium'
                : 'text-green-600 font-medium'
            }>
              {` ${metrics.mos[0]?.value?.toFixed(2) || 'N/A'}`}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'geographicRouting',
      title: 'Region',
      sortable: true,
      render: (routing: any) => (
        <div className="text-sm">
          {routing.region}
          {routing.latency > performanceThreshold && (
            <span className="ml-2 text-yellow-600">⚠️</span>
          )}
        </div>
      )
    },
    {
      key: 'aiModel',
      title: 'AI Performance',
      sortable: true,
      render: (model: any) => (
        <div className="space-y-1">
          <div className="text-sm">
            Response Time: {model.responseTimeout}ms
          </div>
          <div className="text-sm">
            Context: {model.contextWindow} tokens
          </div>
        </div>
      )
    }
  ];

  // Auto-refresh call data
  useEffect(() => {
    if (!refreshInterval) return;

    const intervalId = setInterval(() => {
      // Voice hook will handle the refresh
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Voice Call History</h2>
        {showMetrics && metrics && (
          <div className="mt-2 grid grid-cols-3 gap-4">
            <div className="text-sm">
              <span className="text-gray-500">Active Calls:</span>
              <span className="ml-2 font-medium">
                {calls.filter(c => c.status === VoiceCallStatus.IN_PROGRESS).length}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Avg. Latency:</span>
              <span className={`ml-2 font-medium ${
                performance?.latency > performanceThreshold ? 'text-red-600' : 'text-green-600'
              }`}>
                {performance?.latency || 0}ms
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Success Rate:</span>
              <span className="ml-2 font-medium">
                {((calls.filter(c => c.status === VoiceCallStatus.COMPLETED).length / 
                   Math.max(calls.length, 1)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      <Table
        columns={columns}
        data={calls}
        pageSize={pageSize}
        sortable={true}
        stickyHeader={true}
        onSort={(key, direction) => setSortConfig({ key, direction })}
        className="w-full"
      />
    </div>
  );
};

export default CallHistory;