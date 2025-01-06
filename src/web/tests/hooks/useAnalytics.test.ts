import { renderHook, act } from '@testing-library/react-hooks'; // v8.0.1
import { Provider } from 'react-redux'; // v8.1.0
import { configureStore } from '@reduxjs/toolkit'; // v1.9.5
import { waitFor } from '@testing-library/react'; // v14.0.0
import { useAnalytics } from '../../src/hooks/useAnalytics';
import { MetricType, TimeRange, IAnalyticsFilter } from '../../src/types/analytics';
import { ANALYTICS_CONFIG } from '../../src/lib/constants';

// Mock WebSocket
class MockWebSocket {
  onmessage: ((event: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = WebSocket.OPEN;
  send = jest.fn();
  close = jest.fn();
}

// Mock initial filter
const mockInitialFilter: IAnalyticsFilter = {
  timeRange: TimeRange.LAST_30_DAYS,
  metricTypes: [
    MetricType.REVENUE,
    MetricType.CONVERSION_RATE,
    MetricType.API_LATENCY,
    MetricType.VOICE_PROCESSING_TIME
  ],
  startDate: null,
  endDate: null,
  campaignId: null,
  refreshInterval: ANALYTICS_CONFIG.UPDATE_INTERVAL
};

// Mock metrics data
const mockMetrics = [
  {
    id: '1',
    type: MetricType.REVENUE,
    value: 124500,
    previousValue: 100000,
    changePercentage: 24.5,
    timestamp: new Date(),
    threshold: 0,
    status: 'normal'
  },
  {
    id: '2',
    type: MetricType.API_LATENCY,
    value: 95,
    previousValue: 105,
    changePercentage: -9.5,
    timestamp: new Date(),
    threshold: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY],
    status: 'normal'
  }
];

// Mock chart data
const mockChartData = [
  {
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [
      {
        label: 'Revenue',
        data: [100000, 120000, 124500],
        color: ANALYTICS_CONFIG.CHART_COLORS[MetricType.REVENUE]
      }
    ],
    type: MetricType.REVENUE,
    thresholds: []
  }
];

// Setup test environment
interface SetupOptions {
  initialState?: any;
  mockWebSocket?: boolean;
}

const setupTest = (options: SetupOptions = {}) => {
  // Create Redux store with mock state
  const store = configureStore({
    reducer: {
      analytics: (state = {
        metrics: [],
        charts: [],
        filter: mockInitialFilter,
        loading: false,
        error: null
      }, action) => state
    },
    preloadedState: options.initialState
  });

  // Create wrapper with Redux Provider
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  // Setup WebSocket mock
  if (options.mockWebSocket) {
    global.WebSocket = MockWebSocket as any;
  }

  return { store, wrapper };
};

describe('useAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should initialize with default state and establish WebSocket connection', async () => {
    const { wrapper } = setupTest({ mockWebSocket: true });
    const { result } = renderHook(() => useAnalytics(mockInitialFilter), { wrapper });

    expect(result.current.metrics).toEqual([]);
    expect(result.current.charts).toEqual([]);
    expect(result.current.filter).toEqual(mockInitialFilter);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle real-time updates via WebSocket', async () => {
    const { wrapper } = setupTest({ mockWebSocket: true });
    const { result } = renderHook(() => useAnalytics(mockInitialFilter), { wrapper });

    const mockUpdate = {
      metrics: mockMetrics,
      timestamp: Date.now()
    };

    await act(async () => {
      const ws = new MockWebSocket();
      ws.onmessage?.({ data: JSON.stringify(mockUpdate) });
    });

    await waitFor(() => {
      expect(result.current.metrics).toEqual(mockMetrics);
    });
  });

  it('should validate performance thresholds', async () => {
    const { wrapper } = setupTest({ mockWebSocket: true });
    const { result } = renderHook(() => useAnalytics(mockInitialFilter), { wrapper });

    const performanceAlert = jest.fn();
    window.addEventListener('analytics-performance-alert', performanceAlert);

    await act(async () => {
      await result.current.fetchMetricsData({
        ...mockInitialFilter,
        metricTypes: [MetricType.API_LATENCY]
      });
    });

    expect(performanceAlert).not.toHaveBeenCalled();

    const highLatencyMetric = {
      ...mockMetrics[1],
      value: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY] + 50
    };

    await act(async () => {
      const ws = new MockWebSocket();
      ws.onmessage?.({ 
        data: JSON.stringify({ 
          metrics: [highLatencyMetric],
          timestamp: Date.now()
        })
      });
    });

    expect(performanceAlert).toHaveBeenCalled();
  });

  it('should handle data compression and export', async () => {
    const { wrapper } = setupTest();
    const { result } = renderHook(() => useAnalytics(mockInitialFilter), { wrapper });

    const exportSpy = jest.spyOn(result.current, 'exportData');

    await act(async () => {
      await result.current.exportData(mockInitialFilter, 'csv');
    });

    expect(exportSpy).toHaveBeenCalledWith(mockInitialFilter, 'csv');
  });

  it('should handle WebSocket reconnection', async () => {
    const { wrapper } = setupTest({ mockWebSocket: true });
    const { result } = renderHook(() => useAnalytics(mockInitialFilter), { wrapper });

    await act(async () => {
      const ws = new MockWebSocket();
      ws.onclose?.();
      jest.advanceTimersByTime(1000);
    });

    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('should cleanup WebSocket connection on unmount', () => {
    const { wrapper } = setupTest({ mockWebSocket: true });
    const { unmount } = renderHook(() => useAnalytics(mockInitialFilter), { wrapper });

    const closeSpy = jest.spyOn(MockWebSocket.prototype, 'close');
    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle subscription to updates', async () => {
    const { wrapper } = setupTest({ mockWebSocket: true });
    const { result } = renderHook(() => useAnalytics(mockInitialFilter), { wrapper });

    const callback = jest.fn();
    let unsubscribe: () => void;

    await act(async () => {
      unsubscribe = result.current.subscribeToUpdates(callback);
    });

    const mockUpdate = {
      metrics: mockMetrics,
      timestamp: Date.now()
    };

    await act(async () => {
      const ws = new MockWebSocket();
      ws.onmessage?.({ data: JSON.stringify(mockUpdate) });
    });

    expect(callback).toHaveBeenCalledWith(mockUpdate);

    act(() => {
      unsubscribe();
    });

    await act(async () => {
      const ws = new MockWebSocket();
      ws.onmessage?.({ data: JSON.stringify(mockUpdate) });
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});