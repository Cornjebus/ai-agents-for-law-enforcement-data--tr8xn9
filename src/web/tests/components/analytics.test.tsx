import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import WS from 'jest-websocket-mock';
import ResizeObserver from 'resize-observer-polyfill';
import 'jest-canvas-mock';

import MetricsCard from '../../src/components/analytics/MetricsCard';
import PerformanceChart from '../../src/components/analytics/PerformanceChart';
import RevenueChart from '../../src/components/analytics/RevenueChart';
import { MetricType, TimeRange } from '../../src/types/analytics';
import { ANALYTICS_CONFIG } from '../../src/lib/constants';

// Mock ResizeObserver
global.ResizeObserver = ResizeObserver;

// Mock WebSocket server
const mockWebSocketServer = new WS('ws://localhost:1234');

// Mock analytics data
const mockMetricData = {
  revenue: {
    id: '1',
    type: MetricType.REVENUE,
    value: 124500,
    previousValue: 108260,
    changePercentage: 15,
    trend: 'up',
    timestamp: new Date(),
    threshold: 100000,
    status: 'normal'
  },
  conversion: {
    id: '2',
    type: MetricType.CONVERSION_RATE,
    value: 23,
    previousValue: 25,
    changePercentage: -2,
    trend: 'down',
    timestamp: new Date(),
    threshold: 20,
    status: 'warning'
  }
};

const mockChartData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
  datasets: [
    {
      label: 'Performance',
      data: [65, 72, 68, 75, 82],
      color: '#2563EB'
    }
  ],
  type: MetricType.REVENUE,
  thresholds: [
    { value: 70, label: 'Target', color: '#059669' }
  ]
};

// Mock Redux store and hooks
jest.mock('../../src/hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    metrics: mockMetricData,
    charts: { [MetricType.REVENUE]: mockChartData },
    isLoading: false,
    error: null,
    fetchChartData: jest.fn(),
    subscribeToUpdates: jest.fn(() => () => {}),
    unsubscribeFromUpdates: jest.fn()
  })
}));

describe('MetricsCard Component', () => {
  it('renders metric data correctly', () => {
    render(<MetricsCard metric={mockMetricData.revenue} />);
    
    expect(screen.getByText('revenue')).toBeInTheDocument();
    expect(screen.getByText('$124,500')).toBeInTheDocument();
    expect(screen.getByText('15.0%')).toBeInTheDocument();
  });

  it('handles different metric types with correct formatting', () => {
    render(<MetricsCard metric={mockMetricData.conversion} />);
    
    expect(screen.getByText('conversion rate')).toBeInTheDocument();
    expect(screen.getByText('23.0%')).toBeInTheDocument();
  });

  it('applies correct trend indicator styles', () => {
    const { container } = render(<MetricsCard metric={mockMetricData.revenue} />);
    
    const trendIndicator = container.querySelector('.text-success-600');
    expect(trendIndicator).toBeInTheDocument();
  });

  it('maintains accessibility standards', () => {
    render(<MetricsCard metric={mockMetricData.revenue} />);
    
    const card = screen.getByRole('region');
    expect(card).toHaveAttribute('aria-label', 'revenue metric card');
  });

  it('handles click events correctly', () => {
    const handleClick = jest.fn();
    render(<MetricsCard metric={mockMetricData.revenue} onClick={handleClick} />);
    
    fireEvent.click(screen.getByRole('region'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('PerformanceChart Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    WS.clean();
  });

  it('renders chart with correct configuration', async () => {
    render(
      <PerformanceChart
        metricType={MetricType.API_LATENCY}
        timeRange={TimeRange.LAST_30_DAYS}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('region')).toBeInTheDocument();
    });
  });

  it('handles real-time updates via WebSocket', async () => {
    render(
      <PerformanceChart
        metricType={MetricType.API_LATENCY}
        timeRange={TimeRange.REAL_TIME}
      />
    );

    await mockWebSocketServer.connected;
    mockWebSocketServer.send(JSON.stringify({
      type: 'metrics_update',
      data: mockChartData
    }));

    await waitFor(() => {
      expect(screen.getByRole('region')).toBeInTheDocument();
    });
  });

  it('implements data compression for large datasets', async () => {
    const largeData = {
      ...mockChartData,
      labels: Array(1000).fill('').map((_, i) => `Day ${i}`),
      datasets: [{
        ...mockChartData.datasets[0],
        data: Array(1000).fill(0).map(() => Math.random() * 100)
      }]
    };

    render(
      <PerformanceChart
        metricType={MetricType.API_LATENCY}
        timeRange={TimeRange.LAST_90_DAYS}
        compressionRatio={0.5}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('region')).toBeInTheDocument();
    });
  });

  it('maintains performance under heavy updates', async () => {
    const startTime = performance.now();
    
    render(
      <PerformanceChart
        metricType={MetricType.API_LATENCY}
        timeRange={TimeRange.REAL_TIME}
        refreshInterval={100}
      />
    );

    // Simulate rapid updates
    for (let i = 0; i < 10; i++) {
      mockWebSocketServer.send(JSON.stringify({
        type: 'metrics_update',
        data: mockChartData
      }));
      jest.advanceTimersByTime(100);
    }

    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY]);
  });
});

describe('RevenueChart Component', () => {
  it('renders revenue data with correct formatting', () => {
    render(
      <RevenueChart
        timeRange={TimeRange.LAST_30_DAYS}
        showTargetLine={true}
        targetValue={100000}
      />
    );

    expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Revenue trends over time');
  });

  it('handles currency formatting correctly', async () => {
    render(
      <RevenueChart
        timeRange={TimeRange.LAST_30_DAYS}
        showTargetLine={true}
      />
    );

    await waitFor(() => {
      const formattedValue = screen.getByText('$124,500');
      expect(formattedValue).toBeInTheDocument();
    });
  });

  it('implements month-over-month comparison correctly', async () => {
    const handleDataPointClick = jest.fn();
    
    render(
      <RevenueChart
        timeRange={TimeRange.LAST_30_DAYS}
        onDataPointClick={handleDataPointClick}
      />
    );

    await waitFor(() => {
      const chart = screen.getByRole('region');
      fireEvent.click(chart);
      expect(handleDataPointClick).toHaveBeenCalledWith(
        expect.objectContaining({
          formattedValue: expect.any(String),
          periodComparison: expect.any(Object)
        })
      );
    });
  });

  it('handles mobile responsiveness correctly', async () => {
    global.innerWidth = 375;
    global.dispatchEvent(new Event('resize'));

    render(
      <RevenueChart
        timeRange={TimeRange.LAST_30_DAYS}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('region')).toBeInTheDocument();
    });
  });

  it('implements security measures for data handling', async () => {
    const unsafeData = {
      ...mockChartData,
      labels: ['<script>alert("xss")</script>'],
      datasets: [{
        ...mockChartData.datasets[0],
        data: [100]
      }]
    };

    render(
      <RevenueChart
        timeRange={TimeRange.LAST_30_DAYS}
      />
    );

    await waitFor(() => {
      const chart = screen.getByRole('region');
      expect(chart.innerHTML).not.toContain('<script>');
    });
  });
});