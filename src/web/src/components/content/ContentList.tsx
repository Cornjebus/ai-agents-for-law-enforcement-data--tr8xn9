import React, { memo, useCallback, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns'; // v2.30.0
import Table from '../shared/Table';
import { useContent } from '../../hooks/useContent';
import { useAuth } from '../../hooks/useAuth';
import { Content, ContentStatus, ContentPlatform } from '../../types/content';
import { DESIGN_SYSTEM } from '../../lib/constants';

interface ContentListProps {
  campaignId?: string;
  onContentSelect: (content: Content) => void;
  className?: string;
}

const ContentList: React.FC<ContentListProps> = memo(({
  campaignId,
  onContentSelect,
  className = ''
}) => {
  // State and hooks
  const { content, isLoading, error, refetch } = useContent();
  const { checkPermission } = useAuth();
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Filter content by campaign if campaignId is provided
  const filteredContent = useMemo(() => {
    return campaignId
      ? content.filter(item => item.campaignId === campaignId)
      : content;
  }, [content, campaignId]);

  // Status badge styles
  const getStatusBadgeStyle = useCallback((status: ContentStatus) => {
    const baseStyle = 'px-2 py-1 text-sm font-medium rounded-full';
    switch (status) {
      case ContentStatus.DRAFT:
        return `${baseStyle} bg-gray-100 text-gray-800`;
      case ContentStatus.PENDING_APPROVAL:
        return `${baseStyle} bg-yellow-100 text-yellow-800`;
      case ContentStatus.APPROVED:
        return `${baseStyle} bg-green-100 text-green-800`;
      case ContentStatus.PUBLISHED:
        return `${baseStyle} bg-blue-100 text-blue-800`;
      case ContentStatus.ARCHIVED:
        return `${baseStyle} bg-red-100 text-red-800`;
      default:
        return baseStyle;
    }
  }, []);

  // Performance indicator styles
  const getPerformanceStyle = useCallback((score: number) => {
    const baseStyle = 'font-medium';
    if (score >= 80) return `${baseStyle} text-green-600`;
    if (score >= 60) return `${baseStyle} text-yellow-600`;
    return `${baseStyle} text-red-600`;
  }, []);

  // Table columns configuration
  const columns = useMemo(() => [
    {
      key: 'title',
      title: 'Title',
      sortable: true,
      render: (value: string, row: Content) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">{value}</span>
          <span className="text-sm text-gray-500">{row.metadata.description}</span>
        </div>
      )
    },
    {
      key: 'platform',
      title: 'Platform',
      sortable: true,
      render: (value: ContentPlatform) => (
        <span className="inline-flex items-center">
          {value === ContentPlatform.LINKEDIN && (
            <span className="text-blue-600">LinkedIn</span>
          )}
          {value === ContentPlatform.TWITTER && (
            <span className="text-sky-500">Twitter</span>
          )}
          {value === ContentPlatform.TIKTOK && (
            <span className="text-pink-500">TikTok</span>
          )}
        </span>
      )
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value: ContentStatus) => (
        <span className={getStatusBadgeStyle(value)}>
          {value.replace('_', ' ')}
        </span>
      )
    },
    {
      key: 'metrics',
      title: 'Performance',
      render: (_: any, row: Content) => {
        const { metrics } = row;
        return (
          <div className="flex flex-col">
            <span className={getPerformanceStyle(metrics.aiPerformance[0].optimizationScore)}>
              {`${metrics.aiPerformance[0].optimizationScore}% Optimization`}
            </span>
            <span className="text-sm text-gray-500">
              {`${metrics.engagements} engagements`}
            </span>
          </div>
        );
      }
    },
    {
      key: 'createdAt',
      title: 'Created',
      sortable: true,
      render: (value: Date) => (
        <span className="text-gray-500">
          {formatDistanceToNow(new Date(value), { addSuffix: true })}
        </span>
      )
    },
    {
      key: 'actions',
      title: '',
      render: (_: any, row: Content) => (
        <div className="flex items-center space-x-2">
          {checkPermission('content.edit') && (
            <button
              onClick={() => onContentSelect(row)}
              className="text-primary-600 hover:text-primary-700 font-medium"
              aria-label="Edit content"
            >
              Edit
            </button>
          )}
          {checkPermission('content.distribute') && row.status === ContentStatus.APPROVED && (
            <button
              onClick={() => handleDistribute(row)}
              className="text-green-600 hover:text-green-700 font-medium"
              aria-label="Distribute content"
            >
              Distribute
            </button>
          )}
        </div>
      )
    }
  ], [checkPermission, getStatusBadgeStyle, getPerformanceStyle, onContentSelect]);

  // Sort handler
  const handleSort = useCallback((key: string, direction: 'asc' | 'desc') => {
    setSortKey(key);
    setSortDirection(direction);
  }, []);

  // Distribution handler
  const handleDistribute = useCallback((content: Content) => {
    // Implementation handled by parent component through onContentSelect
    onContentSelect(content);
  }, [onContentSelect]);

  // Error handling
  if (error) {
    return (
      <div className="p-4 text-error-500 bg-error-50 rounded-lg">
        <p>Error loading content: {error}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-error-600 hover:text-error-700 font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <Table
        columns={columns}
        data={filteredContent}
        loading={isLoading}
        sortable
        onSort={handleSort}
        className="shadow-sm rounded-lg"
        stickyHeader
        pagination
        pageSize={10}
      />
    </div>
  );
});

ContentList.displayName = 'ContentList';

export default ContentList;