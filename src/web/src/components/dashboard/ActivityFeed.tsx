import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { VirtualList } from 'react-window';
import useWebSocket from 'react-use-websocket';
import clsx from 'clsx';

import Card, { CardProps } from '../shared/Card';
import { ICampaign, CampaignStatus, CampaignType } from '../../types/campaign';
import { ILead, LeadStatus, LeadSource } from '../../types/lead';
import { useNotification } from '../../hooks/useNotification';
import { DESIGN_SYSTEM } from '../../lib/constants';

// Activity interface with enhanced metadata
interface Activity {
  id: string;
  type: 'campaign' | 'lead' | 'ai';
  title: string;
  description: string;
  timestamp: Date;
  metadata: Record<string, any>;
  status: 'pending' | 'success' | 'error';
  priority: 'low' | 'medium' | 'high';
}

// Props interface with configuration options
interface ActivityFeedProps {
  maxItems?: number;
  className?: string;
  autoRefresh?: boolean;
  filterTypes?: Array<'campaign' | 'lead' | 'ai'>;
  groupByType?: boolean;
  onActivityClick?: (activity: Activity) => void;
}

// Constants for component configuration
const ACTIVITY_ITEM_HEIGHT = 72;
const MAX_VISIBLE_ITEMS = 10;
const WS_RECONNECT_INTERVAL = 3000;
const ACTIVITY_UPDATE_DEBOUNCE = 250;

/**
 * ActivityFeed component for displaying real-time system activities
 * Implements virtualization for performance and WebSocket for real-time updates
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  maxItems = 10,
  className,
  autoRefresh = true,
  filterTypes,
  groupByType = false,
  onActivityClick
}) => {
  // State management
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showNotification } = useNotification();

  // WebSocket connection for real-time updates
  const { lastMessage, readyState } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WS_URL}/activities`,
    {
      reconnectInterval: WS_RECONNECT_INTERVAL,
      shouldReconnect: () => autoRefresh,
      onOpen: () => {
        console.log('Activity WebSocket connected');
      },
      onError: () => {
        showNotification({
          message: 'Real-time updates connection lost',
          type: 'warning'
        });
      }
    }
  );

  // Format activity data with proper localization
  const formatActivity = useCallback((activity: Activity): string => {
    const timeFormatted = format(activity.timestamp, 'HH:mm');
    
    switch (activity.type) {
      case 'campaign':
        return `${timeFormatted} - Campaign "${activity.metadata.name}" ${activity.metadata.status.toLowerCase()}`;
      case 'lead':
        return `${timeFormatted} - Lead ${activity.metadata.name} (${activity.metadata.status.toLowerCase()})`;
      case 'ai':
        return `${timeFormatted} - AI ${activity.metadata.operation} completed`;
      default:
        return `${timeFormatted} - ${activity.description}`;
    }
  }, []);

  // Memoized activity styles based on type and status
  const getActivityStyles = useMemo(() => (activity: Activity) => {
    return clsx(
      'flex items-center p-3 border-b border-gray-100 transition-colors duration-200',
      {
        'bg-blue-50': activity.type === 'campaign',
        'bg-green-50': activity.type === 'lead',
        'bg-purple-50': activity.type === 'ai',
        'opacity-75': activity.status === 'pending',
        'cursor-pointer hover:bg-gray-50': !!onActivityClick
      }
    );
  }, [onActivityClick]);

  // Handle new activity from WebSocket
  useEffect(() => {
    if (lastMessage) {
      try {
        const newActivity = JSON.parse(lastMessage.data) as Activity;
        
        setActivities(current => {
          const updated = [newActivity, ...current].slice(0, maxItems);
          return filterTypes 
            ? updated.filter(activity => filterTypes.includes(activity.type))
            : updated;
        });

        // Show notification for high priority activities
        if (newActivity.priority === 'high') {
          showNotification({
            message: formatActivity(newActivity),
            type: 'info'
          });
        }
      } catch (error) {
        console.error('Error processing activity update:', error);
      }
    }
  }, [lastMessage, maxItems, filterTypes, formatActivity, showNotification]);

  // Activity click handler with analytics tracking
  const handleActivityClick = useCallback((activity: Activity) => {
    if (onActivityClick) {
      // Track interaction for analytics
      window.dispatchEvent(new CustomEvent('activity-interaction', {
        detail: {
          activityId: activity.id,
          activityType: activity.type,
          timestamp: Date.now()
        }
      }));
      
      onActivityClick(activity);
    }
  }, [onActivityClick]);

  // Render activity item with proper accessibility
  const renderActivity = useCallback(({ index, style }: any) => {
    const activity = activities[index];
    if (!activity) return null;

    return (
      <div
        key={activity.id}
        style={style}
        className={getActivityStyles(activity)}
        onClick={() => handleActivityClick(activity)}
        role="listitem"
        tabIndex={0}
        aria-label={formatActivity(activity)}
      >
        <div className="flex-1">
          <h4 className={clsx(
            'text-sm font-medium',
            DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary
          )}>
            {activity.title}
          </h4>
          <p className={clsx(
            'text-xs text-gray-500',
            DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.secondary
          )}>
            {formatActivity(activity)}
          </p>
        </div>
        {activity.status === 'error' && (
          <span className="text-red-500 ml-2" aria-label="Error">⚠️</span>
        )}
      </div>
    );
  }, [activities, formatActivity, getActivityStyles, handleActivityClick]);

  // Group activities by type if enabled
  const groupedActivities = useMemo(() => {
    if (!groupByType) return activities;

    return activities.reduce((groups, activity) => {
      const type = activity.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(activity);
      return groups;
    }, {} as Record<string, Activity[]>);
  }, [activities, groupByType]);

  return (
    <Card
      variant="default"
      padding="none"
      className={clsx('h-[400px] overflow-hidden', className)}
      role="feed"
      aria-busy={isLoading}
      aria-live="polite"
    >
      <div className="p-4 border-b border-gray-200">
        <h3 className={clsx(
          'text-lg font-semibold',
          DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary
        )}>
          Recent Activity
        </h3>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <span className="text-gray-500">Loading activities...</span>
        </div>
      ) : activities.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <span className="text-gray-500">No recent activities</span>
        </div>
      ) : (
        <VirtualList
          height={ACTIVITY_ITEM_HEIGHT * Math.min(activities.length, MAX_VISIBLE_ITEMS)}
          itemCount={activities.length}
          itemSize={ACTIVITY_ITEM_HEIGHT}
          width="100%"
          overscanCount={2}
        >
          {renderActivity}
        </VirtualList>
      )}
    </Card>
  );
};

export default React.memo(ActivityFeed);