import { useCallback, useState, useEffect, useRef } from 'react'; // v18.0.0
import { nanoid } from 'nanoid'; // v4.0.0
import { ToastProps } from '../components/shared/Toast';
import { useAppDispatch, useAppSelector } from '../store';

/**
 * Configuration options for showing notifications with type safety
 */
export interface NotificationOptions {
  /** Notification message content (sanitized for XSS) */
  message: string;
  /** Type of notification with semantic meaning */
  type?: 'info' | 'success' | 'warning' | 'error';
  /** Duration in milliseconds before auto-dismiss */
  duration?: number;
  /** Priority level for notification queue management */
  priority?: number;
  /** Whether notification can be manually dismissed */
  dismissible?: boolean;
}

/**
 * Custom hook for managing application-wide notifications with performance optimizations
 */
export function useNotification() {
  // Local state for active notifications
  const [notifications, setNotifications] = useState<Map<string, ToastProps>>(new Map());
  
  // Queue for managing notification display
  const notificationQueue = useRef<Array<{ id: string; options: NotificationOptions }>>([]); 
  
  // Track notification timers for cleanup
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Redux dispatch and selector
  const dispatch = useAppDispatch();

  /**
   * Shows a new notification with queue management
   */
  const showNotification = useCallback((options: NotificationOptions) => {
    const id = nanoid();
    const {
      message,
      type = 'info',
      duration = 3000,
      priority = 0,
      dismissible = true
    } = options;

    // Create notification props
    const notificationProps: ToastProps = {
      id,
      message,
      type,
      duration,
      onDismiss: () => dismissNotification(id),
      isReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };

    // Add to queue based on priority
    const queueItem = { id, options: { ...options, priority } };
    const insertIndex = notificationQueue.current.findIndex(
      item => item.options.priority < priority
    );

    if (insertIndex === -1) {
      notificationQueue.current.push(queueItem);
    } else {
      notificationQueue.current.splice(insertIndex, 0, queueItem);
    }

    // Process queue
    processNotificationQueue();

    return id;
  }, []);

  /**
   * Process notification queue with performance optimization
   */
  const processNotificationQueue = useCallback(() => {
    // Limit maximum concurrent notifications
    const MAX_CONCURRENT = 3;
    
    while (
      notificationQueue.current.length > 0 && 
      notifications.size < MAX_CONCURRENT
    ) {
      const { id, options } = notificationQueue.current.shift()!;
      
      setNotifications(current => {
        const updated = new Map(current);
        updated.set(id, {
          id,
          message: options.message,
          type: options.type || 'info',
          duration: options.duration || 3000,
          onDismiss: () => dismissNotification(id),
          isReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        });
        return updated;
      });

      // Set auto-dismiss timer if duration is provided
      if (options.duration && options.duration > 0) {
        const timer = setTimeout(() => {
          dismissNotification(id);
        }, options.duration);
        timersRef.current.set(id, timer);
      }
    }
  }, [notifications.size]);

  /**
   * Dismisses a specific notification
   */
  const dismissNotification = useCallback((id: string) => {
    // Clear auto-dismiss timer
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setNotifications(current => {
      const updated = new Map(current);
      updated.delete(id);
      return updated;
    });

    // Process queue after dismissal
    processNotificationQueue();
  }, [processNotificationQueue]);

  /**
   * Updates an existing notification
   */
  const updateNotification = useCallback((id: string, options: Partial<NotificationOptions>) => {
    setNotifications(current => {
      const notification = current.get(id);
      if (!notification) return current;

      const updated = new Map(current);
      updated.set(id, {
        ...notification,
        ...options,
        id,
        onDismiss: () => dismissNotification(id)
      });
      return updated;
    });
  }, [dismissNotification]);

  /**
   * Clears all active notifications
   */
  const clearAllNotifications = useCallback(() => {
    // Clear all timers
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();

    // Clear notifications and queue
    setNotifications(new Map());
    notificationQueue.current = [];
  }, []);

  /**
   * Returns current notification count
   */
  const getNotificationCount = useCallback(() => {
    return notifications.size + notificationQueue.current.length;
  }, [notifications.size]);

  /**
   * Cleanup effect for timers
   */
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return {
    showNotification,
    dismissNotification,
    updateNotification,
    clearAllNotifications,
    getNotificationCount
  };
}