import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx'; // v2.0+
import { useRoleAccess } from '@auth/hooks'; // v1.0+
import * as Tooltip from '@radix-ui/react-tooltip'; // v1.0+
import { ILead } from '../../types/lead';
import Card from '../shared/Card';
import Button from '../shared/Button';
import LeadScore from './LeadScore';
import { DESIGN_SYSTEM } from '../../lib/constants';

/**
 * Props interface for LeadCard component
 */
interface LeadCardProps {
  lead: ILead;
  onCall: (id: string) => Promise<void>;
  onEdit: (id: string) => Promise<void>;
  onViewDetails: (id: string) => void;
  className?: string;
  isLoading?: boolean;
  error?: Error;
  onRetry?: () => void;
}

/**
 * Returns appropriate color class for lead status with accessibility support
 */
const getStatusColor = (status: string): string => {
  const colors = {
    NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
    CONTACTED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
    QUALIFIED: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
    CONVERTED: 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100',
    LOST: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
  };
  return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
};

/**
 * Formats the lead's full name with proper handling of missing fields
 */
const formatName = (firstName: string, lastName: string): string => {
  const formattedFirst = firstName?.trim() || '';
  const formattedLast = lastName?.trim() || '';
  return [formattedFirst, formattedLast].filter(Boolean).join(' ') || 'Unknown Lead';
};

/**
 * Enhanced card component displaying lead information with accessibility and real-time updates
 */
export const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  onCall,
  onEdit,
  onViewDetails,
  className,
  isLoading = false,
  error,
  onRetry
}) => {
  // Role-based access control
  const { hasPermission } = useRoleAccess();
  const canEdit = hasPermission('lead.edit');
  const canCall = hasPermission('lead.call');

  // Memoized values
  const statusColor = useMemo(() => getStatusColor(lead.status), [lead.status]);
  const fullName = useMemo(() => formatName(lead.firstName, lead.lastName), [lead.firstName, lead.lastName]);

  // Event handlers
  const handleCall = useCallback(async () => {
    if (canCall && !isLoading) {
      await onCall(lead.id);
    }
  }, [canCall, isLoading, lead.id, onCall]);

  const handleEdit = useCallback(async () => {
    if (canEdit && !isLoading) {
      await onEdit(lead.id);
    }
  }, [canEdit, isLoading, lead.id, onEdit]);

  const handleViewDetails = useCallback(() => {
    if (!isLoading) {
      onViewDetails(lead.id);
    }
  }, [isLoading, lead.id, onViewDetails]);

  return (
    <Card
      variant="interactive"
      className={clsx(
        'transition-all duration-200',
        isLoading && 'opacity-75 pointer-events-none',
        error && 'border-red-300 bg-red-50',
        className
      )}
      role="article"
      aria-label={`Lead card for ${fullName}`}
      aria-busy={isLoading}
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Header Section */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {fullName}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {lead.company}
            </p>
          </div>
          <LeadScore
            lead={lead}
            showTrend={false}
            className="ml-4"
          />
        </div>

        {/* Content Section */}
        <div className="grid grid-cols-2 gap-3 py-3">
          <div className="flex flex-col">
            <span className="text-sm text-gray-600 dark:text-gray-400">Email</span>
            <a
              href={`mailto:${lead.email}`}
              className="text-blue-600 dark:text-blue-400 hover:underline"
              aria-label={`Send email to ${lead.email}`}
            >
              {lead.email}
            </a>
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span
                  className={clsx(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    statusColor
                  )}
                >
                  {lead.status}
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content
                className="bg-gray-900 text-white px-2 py-1 rounded text-sm"
                side="top"
              >
                Last updated: {new Date(lead.updatedAt).toLocaleString()}
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
        </div>

        {/* Actions Section */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="flex items-center gap-2">
            {canCall && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleCall}
                isLoading={isLoading}
                startIcon={<CallIcon />}
                aria-label={`Call ${fullName}`}
              >
                Call
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                isLoading={isLoading}
                startIcon={<EditIcon />}
                aria-label={`Edit ${fullName}'s information`}
              >
                Edit
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewDetails}
            isLoading={isLoading}
            aria-label={`View details for ${fullName}`}
          >
            View Details
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
            <p className="text-sm text-red-700">{error.message}</p>
            {onRetry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRetry}
                className="mt-2"
              >
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

// Icon components
const CallIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

const EditIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

export default LeadCard;