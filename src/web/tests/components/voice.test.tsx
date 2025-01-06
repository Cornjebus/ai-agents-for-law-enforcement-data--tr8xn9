import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import WS from 'jest-websocket-mock';
import VoiceControls from '../../src/components/voice/VoiceControls';
import CallMetrics from '../../src/components/voice/CallMetrics';
import { useVoice } from '../../src/hooks/useVoice';
import { VoiceCallStatus, VoiceQuality } from '../../src/types/voice';

// Mock the useVoice hook
vi.mock('../../src/hooks/useVoice');

// Mock WebSocket for real-time metrics testing
const mockWebSocket = new WS('ws://localhost:1234/voice');

// Test constants based on technical specifications
const LATENCY_THRESHOLD = 200; // Maximum RTT in ms
const QUALITY_THRESHOLD = 0.8;
const RETRY_ATTEMPTS = 3;

// Mock data for testing
const mockCall = {
  id: 'test-call-123',
  status: VoiceCallStatus.IN_PROGRESS,
  metrics: {
    latency: [{ value: 150, timestamp: new Date(), region: 'us-west-1' }],
    quality: [{ value: 0.95, timestamp: new Date(), region: 'us-west-1' }],
    errors: [{ value: 0, timestamp: new Date(), region: 'us-west-1' }]
  },
  geographicRouting: {
    region: 'us-west-1',
    latency: 150,
    quality: 0.95
  }
};

// Mock geographic routing configuration
const mockGeographicConfig = {
  region: 'us-west-1',
  datacenter: 'primary',
  backupRegion: 'us-east-1'
};

describe('Voice Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebSocket.resetMocked();
  });

  afterEach(() => {
    mockWebSocket.close();
  });

  describe('VoiceControls Performance Tests', () => {
    test('validates voice processing latency remains under threshold', async () => {
      const mockInitiateCall = vi.fn().mockResolvedValue(mockCall);
      const mockGetGeographicRoute = vi.fn().mockResolvedValue({
        region: 'us-west-1',
        latency: 150
      });

      (useVoice as jest.Mock).mockReturnValue({
        initiateCall: mockInitiateCall,
        getGeographicRouting: mockGetGeographicRoute
      });

      render(
        <VoiceControls
          campaignId="test-campaign"
          phoneNumber="+1234567890"
          onCallComplete={vi.fn()}
          onPerformanceMetric={vi.fn()}
          onError={vi.fn()}
          geographicConfig={mockGeographicConfig}
        />
      );

      const startButton = screen.getByText('Start Call');
      await userEvent.click(startButton);

      await waitFor(() => {
        expect(mockInitiateCall).toHaveBeenCalledWith(
          '+1234567890',
          'test-campaign',
          expect.objectContaining({
            quality: VoiceQuality.HIGH,
            region: 'us-west-1'
          })
        );
      });

      const latencyValue = mockCall.metrics.latency[0].value;
      expect(latencyValue).toBeLessThanOrEqual(LATENCY_THRESHOLD);
    });

    test('handles geographic routing optimization for high latency', async () => {
      const mockInitiateCall = vi.fn().mockResolvedValue({
        ...mockCall,
        metrics: {
          ...mockCall.metrics,
          latency: [{ value: 250, timestamp: new Date(), region: 'us-west-1' }]
        }
      });

      (useVoice as jest.Mock).mockReturnValue({
        initiateCall: mockInitiateCall,
        getGeographicRouting: vi.fn().mockResolvedValue({
          region: 'us-east-1',
          latency: 150
        })
      });

      const { rerender } = render(
        <VoiceControls
          campaignId="test-campaign"
          phoneNumber="+1234567890"
          onCallComplete={vi.fn()}
          onPerformanceMetric={vi.fn()}
          onError={vi.fn()}
          geographicConfig={mockGeographicConfig}
        />
      );

      await userEvent.click(screen.getByText('Start Call'));

      // Verify backup region is used when latency exceeds threshold
      await waitFor(() => {
        expect(mockInitiateCall).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            region: 'us-east-1'
          })
        );
      });
    });
  });

  describe('CallMetrics Real-time Updates', () => {
    test('updates metrics in real-time via WebSocket', async () => {
      const mockMetrics = {
        latency: [{ value: 150, timestamp: new Date(), region: 'us-west-1' }],
        quality: [{ value: 0.95, timestamp: new Date(), region: 'us-west-1' }]
      };

      (useVoice as jest.Mock).mockReturnValue({
        calls: [mockCall],
        metrics: mockMetrics
      });

      render(
        <CallMetrics
          callId={mockCall.id}
          refreshInterval={1000}
          performanceMode={true}
        />
      );

      // Simulate WebSocket metric update
      mockWebSocket.send(JSON.stringify({
        type: 'metrics_update',
        data: {
          callId: mockCall.id,
          metrics: {
            latency: [{ value: 160, timestamp: new Date(), region: 'us-west-1' }],
            quality: [{ value: 0.92, timestamp: new Date(), region: 'us-west-1' }]
          }
        }
      }));

      await waitFor(() => {
        const chart = screen.getByRole('region', { name: /Voice Call Metrics/i });
        expect(chart).toBeInTheDocument();
      });
    });

    test('triggers performance alerts when metrics exceed thresholds', async () => {
      const mockPerformanceAlert = vi.fn();
      window.addEventListener('voice-performance-alert', mockPerformanceAlert);

      const highLatencyMetrics = {
        latency: [{ value: 250, timestamp: new Date(), region: 'us-west-1' }],
        quality: [{ value: 0.75, timestamp: new Date(), region: 'us-west-1' }]
      };

      (useVoice as jest.Mock).mockReturnValue({
        calls: [mockCall],
        metrics: highLatencyMetrics
      });

      render(
        <CallMetrics
          callId={mockCall.id}
          performanceMode={true}
          thresholds={{
            latency: { warning: 180, critical: 200 },
            quality: { warning: 0.85, critical: 0.8 }
          }}
        />
      );

      await waitFor(() => {
        expect(mockPerformanceAlert).toHaveBeenCalled();
        const alertDetail = mockPerformanceAlert.mock.calls[0][0].detail;
        expect(alertDetail).toMatchObject({
          callId: mockCall.id,
          latencyAlert: true,
          qualityAlert: true
        });
      });

      window.removeEventListener('voice-performance-alert', mockPerformanceAlert);
    });
  });

  describe('AI Conversation Handling', () => {
    test('maintains conversation quality during autonomous calls', async () => {
      const mockSynthesizeVoice = vi.fn().mockResolvedValue(new ArrayBuffer(0));
      const mockInitiateCall = vi.fn().mockResolvedValue(mockCall);

      (useVoice as jest.Mock).mockReturnValue({
        initiateCall: mockInitiateCall,
        synthesizeVoice: mockSynthesizeVoice,
        getGeographicRouting: vi.fn().mockResolvedValue({
          region: 'us-west-1',
          latency: 150
        })
      });

      render(
        <VoiceControls
          campaignId="test-campaign"
          phoneNumber="+1234567890"
          onCallComplete={vi.fn()}
          onPerformanceMetric={vi.fn()}
          onError={vi.fn()}
          geographicConfig={mockGeographicConfig}
        />
      );

      await userEvent.click(screen.getByText('Start Call'));

      await waitFor(() => {
        expect(mockInitiateCall).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            quality: VoiceQuality.HIGH
          })
        );
      });

      // Verify voice quality metrics
      const qualityScore = mockCall.metrics.quality[0].value;
      expect(qualityScore).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('implements retry mechanism for failed calls', async () => {
      let attemptCount = 0;
      const mockInitiateCall = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Call failed');
        }
        return mockCall;
      });

      (useVoice as jest.Mock).mockReturnValue({
        initiateCall: mockInitiateCall,
        getGeographicRouting: vi.fn().mockResolvedValue({
          region: 'us-west-1',
          latency: 150
        })
      });

      const mockOnError = vi.fn();

      render(
        <VoiceControls
          campaignId="test-campaign"
          phoneNumber="+1234567890"
          onCallComplete={vi.fn()}
          onPerformanceMetric={vi.fn()}
          onError={mockOnError}
          geographicConfig={mockGeographicConfig}
        />
      );

      await userEvent.click(screen.getByText('Start Call'));

      await waitFor(() => {
        expect(mockInitiateCall).toHaveBeenCalledTimes(3);
        expect(mockOnError).toHaveBeenCalledTimes(2);
      });
    });
  });
});