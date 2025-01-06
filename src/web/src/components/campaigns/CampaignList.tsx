import React, { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx'; // v2.0+
import { format } from 'date-fns';
import { ICampaign } from '../../types/campaign';
import Table from '../shared/Table';
import CampaignCard from './CampaignCard';
import { useCampaign } from '../../hooks/useCampaign';
import { DESIGN_SYSTEM } from '../../lib/constants';

interface CampaignListProps {
  className?: string;
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  pageSize?: number;
  initialFilters?: Record<string, any>;
}

const CampaignList: React.FC<CampaignListProps> = ({
  className = '',
  onEdit,
  onPause,
  onResume,
  pageSize = 25,
  initialFilters = {}
}) => {
  // State and hooks
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: 'createdAt',
    direction: 'desc'
  });
  const [filters, setFilters] = useState(initialFilters);
  const [isMobile, setIsMobile] = useState(window.innerWidth < DESIGN_SYSTEM.BREAKPOINTS.tablet);

  const {
    campaigns,
    loading,
    error,
    actions: { refresh: fetchCampaigns }
  } = useCampaign();

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < DESIGN_SYSTEM.BREAKPOINTS.tablet);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Table columns configuration
  const columns = useMemo(() => [
    {
      key: 'name',
      title: 'Campaign Name',
      sortable: true,
      filterable: true,
      width: '25%',
      render: (value: string, campaign: ICampaign) => (
        <div className="flex items-center">
          <span className="font-medium text-gray-900">{value}</span>
        </div>
      )
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      filterable: true,
      width: '15%',
      render: (value: string) => (
        <span className={clsx(
          'px-2 py-1 rounded-full text-sm font-medium',
          {
            'bg-green-50 text-green-700': value === 'ACTIVE',
            'bg-yellow-50 text-yellow-700': value === 'PAUSED',
            'bg-blue-50 text-blue-700': value === 'COMPLETED',
            'bg-red-50 text-red-700': value === 'FAILED',
            'bg-gray-50 text-gray-700': value === 'DRAFT'
          }
        )}>
          {value}
        </span>
      )
    },
    {
      key: 'metrics.revenue',
      title: 'Revenue',
      sortable: true,
      width: '15%',
      render: (value: number) => (
        <span className="font-medium text-gray-900">
          ${value.toLocaleString()}
        </span>
      )
    },
    {
      key: 'metrics.conversions',
      title: 'Conversions',
      sortable: true,
      width: '15%',
      render: (value: number, campaign: ICampaign) => (
        <div>
          <span className="font-medium text-gray-900">
            {value.toLocaleString()}
          </span>
          <span className="text-sm text-gray-500 ml-1">
            ({(campaign.metrics.conversionRate * 100).toFixed(1)}%)
          </span>
        </div>
      )
    },
    {
      key: 'createdAt',
      title: 'Created',
      sortable: true,
      width: '15%',
      render: (value: string) => (
        <span className="text-gray-500">
          {format(new Date(value), 'MMM d, yyyy')}
        </span>
      )
    },
    {
      key: 'actions',
      title: '',
      width: '15%',
      render: (_: any, campaign: ICampaign) => (
        <div className="flex justify-end space-x-2">
          <button
            onClick={() => onEdit(campaign.id)}
            className="text-primary-600 hover:text-primary-700"
            aria-label={`Edit ${campaign.name}`}
          >
            Edit
          </button>
          {campaign.status === 'ACTIVE' ? (
            <button
              onClick={() => onPause(campaign.id)}
              className="text-yellow-600 hover:text-yellow-700"
              aria-label={`Pause ${campaign.name}`}
            >
              Pause
            </button>
          ) : campaign.status === 'PAUSED' ? (
            <button
              onClick={() => onResume(campaign.id)}
              className="text-green-600 hover:text-green-700"
              aria-label={`Resume ${campaign.name}`}
            >
              Resume
            </button>
          ) : null}
        </div>
      )
    }
  ], [onEdit, onPause, onResume]);

  // Handle sorting
  const handleSort = useCallback((key: string, direction: 'asc' | 'desc' | null) => {
    setSortConfig({ key, direction });
  }, []);

  // Handle filtering
  const handleFilter = useCallback((key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  // Render mobile card view
  const renderMobileView = () => (
    <div className="space-y-4">
      {campaigns?.map(campaign => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          onEdit={onEdit}
          onPause={onPause}
          onResume={onResume}
          isLoading={loading}
          error={error ? new Error(error) : null}
          onRetry={fetchCampaigns}
        />
      ))}
    </div>
  );

  // Render desktop table view
  const renderDesktopView = () => (
    <Table
      columns={columns}
      data={campaigns || []}
      loading={loading}
      error={error}
      sortable
      filterable
      virtualized
      stickyHeader
      pagination
      pageSize={pageSize}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      onSort={handleSort}
      onFilter={handleFilter}
      className="min-h-[400px]"
    />
  );

  return (
    <div
      className={clsx(
        'w-full',
        loading && 'opacity-50 pointer-events-none',
        className
      )}
      aria-busy={loading}
      role="region"
      aria-label="Campaign list"
    >
      {error && (
        <div className="bg-red-50 p-4 rounded-md mb-4" role="alert">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={fetchCampaigns}
            className="mt-2 text-sm text-red-700 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <div className="block md:hidden">
        {renderMobileView()}
      </div>
      <div className="hidden md:block">
        {renderDesktopView()}
      </div>
    </div>
  );
};

export default CampaignList;