import React, { useState, useMemo, useCallback } from 'react';
import { VirtualList } from 'react-window';
import clsx from 'clsx';
import { useRoleAccess } from '@auth/role-access';
import { ILead, LeadStatus } from '../../types/lead';
import { useLeads } from '../../hooks/useLeads';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { UserRole } from '../../types/auth';

// Enhanced column configuration type
interface LeadTableColumn {
  key: keyof ILead;
  title: string;
  sortable: boolean;
  width: string;
  renderCell: (lead: ILead) => React.ReactNode;
  accessibilityLabel: string;
  filterConfig?: {
    type: 'select' | 'range' | 'date' | 'text';
    options?: { label: string; value: any }[];
  };
}

// Enhanced props interface
interface LeadListProps {
  viewType: 'table' | 'grid';
  onViewTypeChange: (type: 'table' | 'grid') => void;
  className?: string;
  pageSize: number;
  filters: {
    status?: LeadStatus[];
    scoreRange?: { min: number; max: number };
    dateRange?: { start: Date; end: Date };
  };
  sortConfig: {
    key: keyof ILead;
    direction: 'asc' | 'desc';
  };
  onFilterChange: (filters: any) => void;
  onSortChange: (sortConfig: any) => void;
}

// Score badge component
const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-blue-100 text-blue-800';
    if (score >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <span className={clsx(
      'px-2 py-1 rounded-full text-xs font-medium',
      getScoreColor(score)
    )}>
      {score}
    </span>
  );
};

// Status badge component
const StatusBadge: React.FC<{ status: LeadStatus }> = ({ status }) => {
  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case LeadStatus.NEW: return 'bg-blue-100 text-blue-800';
      case LeadStatus.QUALIFIED: return 'bg-green-100 text-green-800';
      case LeadStatus.CONTACTED: return 'bg-yellow-100 text-yellow-800';
      case LeadStatus.CONVERTED: return 'bg-purple-100 text-purple-800';
      case LeadStatus.LOST: return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={clsx(
      'px-2 py-1 rounded-full text-xs font-medium',
      getStatusColor(status)
    )}>
      {status}
    </span>
  );
};

export const LeadList: React.FC<LeadListProps> = ({
  viewType = 'table',
  onViewTypeChange,
  className,
  pageSize = 25,
  filters,
  sortConfig,
  onFilterChange,
  onSortChange
}) => {
  // Hooks and state
  const { leads, loading, error, totalCount, isRealTimeEnabled } = useLeads(filters);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const canManageLeads = useRoleAccess(UserRole.MANAGER);
  const canUpdateScores = useRoleAccess(UserRole.ANALYST);

  // Column configuration with accessibility and custom renderers
  const columns = useMemo<LeadTableColumn[]>(() => [
    {
      key: 'firstName',
      title: 'Name',
      sortable: true,
      width: '200px',
      accessibilityLabel: 'Lead name',
      renderCell: (lead) => (
        <div className="flex items-center">
          <span className="font-medium">{`${lead.firstName} ${lead.lastName}`}</span>
        </div>
      ),
      filterConfig: { type: 'text' }
    },
    {
      key: 'company',
      title: 'Company',
      sortable: true,
      width: '150px',
      accessibilityLabel: 'Company name',
      renderCell: (lead) => <span>{lead.company}</span>,
      filterConfig: { type: 'text' }
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      width: '120px',
      accessibilityLabel: 'Lead status',
      renderCell: (lead) => <StatusBadge status={lead.status} />,
      filterConfig: {
        type: 'select',
        options: Object.values(LeadStatus).map(status => ({
          label: status,
          value: status
        }))
      }
    },
    {
      key: 'score',
      title: 'Score',
      sortable: true,
      width: '100px',
      accessibilityLabel: 'Lead score',
      renderCell: (lead) => <ScoreBadge score={lead.score} />,
      filterConfig: {
        type: 'range',
        options: { min: 0, max: 100 }
      }
    }
  ], []);

  // Handle sort changes with optimistic updates
  const handleSort = useCallback((key: keyof ILead, direction: 'asc' | 'desc') => {
    onSortChange({ key, direction });
  }, [onSortChange]);

  // Render table view
  const renderTable = () => (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {canManageLeads && (
                <th scope="col" className="w-12 px-6 py-3">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    onChange={(e) => {
                      const newSelected = e.target.checked
                        ? new Set(leads.map(lead => lead.id))
                        : new Set();
                      setSelectedLeads(newSelected);
                    }}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  style={{ width: column.width }}
                >
                  <button
                    className={clsx(
                      'group inline-flex items-center',
                      column.sortable && 'cursor-pointer hover:text-gray-900'
                    )}
                    onClick={() => column.sortable && handleSort(
                      column.key,
                      sortConfig.key === column.key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                    )}
                    disabled={!column.sortable}
                    aria-label={`Sort by ${column.accessibilityLabel}`}
                  >
                    {column.title}
                    {column.sortable && (
                      <span className="ml-2 text-gray-400 group-hover:text-gray-900">
                        {/* Sort icon */}
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 3l4 4H6l4-4zm0 14l4-4H6l4 4z" />
                        </svg>
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className={clsx(
                  'hover:bg-gray-50',
                  selectedLeads.has(lead.id) && 'bg-blue-50'
                )}
              >
                {canManageLeads && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => {
                        const newSelected = new Set(selectedLeads);
                        if (selectedLeads.has(lead.id)) {
                          newSelected.delete(lead.id);
                        } else {
                          newSelected.add(lead.id);
                        }
                        setSelectedLeads(newSelected);
                      }}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={`${lead.id}-${column.key}`}
                    className="px-6 py-4 whitespace-nowrap"
                  >
                    {column.renderCell(lead)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Render grid view
  const renderGrid = () => (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {leads.map((lead) => (
        <div
          key={lead.id}
          className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-200"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {`${lead.firstName} ${lead.lastName}`}
              </h3>
              <StatusBadge status={lead.status} />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">{lead.company}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Score</span>
                <ScoreBadge score={lead.score} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Loading state
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            className={clsx(
              'px-4 py-2 rounded-lg',
              viewType === 'table' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            )}
            onClick={() => onViewTypeChange('table')}
          >
            Table View
          </button>
          <button
            className={clsx(
              'px-4 py-2 rounded-lg',
              viewType === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            )}
            onClick={() => onViewTypeChange('grid')}
          >
            Grid View
          </button>
        </div>
        {isRealTimeEnabled && (
          <div className="flex items-center text-sm text-green-500">
            <span className="mr-2">●</span>
            Real-time updates enabled
          </div>
        )}
      </div>

      {/* Main content */}
      {viewType === 'table' ? renderTable() : renderGrid()}

      {/* Footer with pagination info */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-gray-500">
          Showing {leads.length} of {totalCount} leads
        </p>
      </div>
    </div>
  );
};

export default LeadList;