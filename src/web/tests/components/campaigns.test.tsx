import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { act } from 'react-dom/test-utils';
import WS from 'jest-websocket-mock';
import { axe } from 'jest-axe';

import CampaignCard from '../../src/components/campaigns/CampaignCard';
import CampaignList from '../../src/components/campaigns/CampaignList';
import CampaignForm from '../../src/components/campaigns/CampaignForm';
import CampaignMetrics from '../../src/components/campaigns/CampaignMetrics';

// Mock WebSocket server
const WS_URL = 'ws://localhost:8080';
let wsServer: WS;

// Mock campaign data
const mockCampaign = {
  id: 'test-campaign-1',
  organizationId: 'org-1',
  name: 'Test Campaign',
  description: 'Test campaign description',
  type: 'OUTBOUND_CALL',
  status: 'ACTIVE',
  config: {
    budget: {
      daily: 1000,
      total: 10000,
      alerts: {
        threshold: 0.8,
        email: ['test@example.com']
      }
    },
    targeting: {
      audience: ['B2B'],
      locations: [{ type: 'country', coordinates: [0, 0] }],
      interests: ['technology'],
      exclusions: []
    },
    aiConfig: {
      model: 'GPT-4',
      temperature: 0.7,
      maxTokens: 8000,
      contextWindow: 100000
    },
    optimization: {
      enabled: true,
      target: 'revenue',
      strategy: 'balanced',
      constraints: {
        minROAS: 2,
        maxCPA: 100
      },
      autoAdjust: {
        budget: true,
        targeting: true,
        schedule: true
      }
    }
  },
  metrics: {
    revenue: 5000,
    cost: 1000,
    roas: 5,
    leads: 100,
    conversions: 20,
    conversionRate: 0.2,
    analytics: [
      { value: 4500, timestamp: '2023-01-01' }
    ],
    aiMetrics: {
      responseTime: 150,
      accuracy: 0.95,
      optimizationScore: 0.85,
      confidenceLevel: 0.9
    },
    voiceMetrics: {
      clarity: 0.9,
      engagement: 0.85,
      callDuration: 180,
      sentimentScore: 0.8
    },
    realTimeMetrics: {
      activeLeads: 10,
      queuedTasks: 5,
      processingRate: 0.9,
      errorRate: 0.01
    }
  },
  startDate: new Date('2023-01-01'),
  endDate: null,
  createdAt: new Date('2023-01-01'),
  updatedAt: new Date('2023-01-01'),
  lastOptimizedAt: new Date('2023-01-01')
};

// Setup and teardown
beforeEach(() => {
  wsServer = new WS(WS_URL);
});

afterEach(() => {
  WS.clean();
});

describe('CampaignCard', () => {
  const mockHandlers = {
    onEdit: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn()
  };

  test('renders campaign information correctly', () => {
    render(
      <CampaignCard
        campaign={mockCampaign}
        onEdit={mockHandlers.onEdit}
        onPause={mockHandlers.onPause}
        onResume={mockHandlers.onResume}
      />
    );

    expect(screen.getByText(mockCampaign.name)).toBeInTheDocument();
    expect(screen.getByText(/\$5,000/)).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  test('handles campaign actions correctly', async () => {
    render(
      <CampaignCard
        campaign={mockCampaign}
        onEdit={mockHandlers.onEdit}
        onPause={mockHandlers.onPause}
        onResume={mockHandlers.onResume}
      />
    );

    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => {
      expect(mockHandlers.onPause).toHaveBeenCalledWith(mockCampaign.id);
    });
  });

  test('meets accessibility requirements', async () => {
    const { container } = render(
      <CampaignCard
        campaign={mockCampaign}
        onEdit={mockHandlers.onEdit}
        onPause={mockHandlers.onPause}
        onResume={mockHandlers.onResume}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('CampaignList', () => {
  const mockCampaigns = [mockCampaign];

  test('renders campaign list with virtualization', async () => {
    render(
      <CampaignList
        onEdit={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('region')).toBeInTheDocument();
    });
  });

  test('handles real-time updates via WebSocket', async () => {
    render(
      <CampaignList
        onEdit={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
      />
    );

    await wsServer.connected;
    
    act(() => {
      wsServer.send(JSON.stringify({
        type: 'CAMPAIGN_UPDATE',
        data: { ...mockCampaign, metrics: { ...mockCampaign.metrics, revenue: 6000 } }
      }));
    });

    await waitFor(() => {
      expect(screen.getByText(/\$6,000/)).toBeInTheDocument();
    });
  });

  test('implements responsive design correctly', () => {
    const { rerender } = render(
      <CampaignList
        onEdit={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
      />
    );

    // Test mobile view
    window.innerWidth = 375;
    fireEvent(window, new Event('resize'));
    rerender(
      <CampaignList
        onEdit={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
      />
    );

    expect(screen.getByRole('region')).toHaveClass('md:hidden');
  });
});

describe('CampaignMetrics', () => {
  test('renders metrics visualization correctly', async () => {
    render(<CampaignMetrics campaign={mockCampaign} />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('ROAS')).toBeInTheDocument();
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
  });

  test('handles threshold alerts', async () => {
    const onThresholdAlert = jest.fn();
    
    render(
      <CampaignMetrics
        campaign={mockCampaign}
        onThresholdAlert={onThresholdAlert}
        thresholds={{
          revenue: 10000,
          roas: 2.5,
          conversionRate: 0.15,
          aiConfidence: 0.8
        }}
      />
    );

    await waitFor(() => {
      expect(onThresholdAlert).toHaveBeenCalledWith('revenue', 5000);
    });
  });

  test('updates metrics in real-time', async () => {
    render(
      <CampaignMetrics
        campaign={mockCampaign}
        websocketUrl={WS_URL}
      />
    );

    await wsServer.connected;

    act(() => {
      wsServer.send(JSON.stringify({
        type: 'METRICS_UPDATE',
        data: {
          revenue: 7000,
          roas: 6,
          conversionRate: 0.25
        }
      }));
    });

    await waitFor(() => {
      expect(screen.getByText(/\$7,000/)).toBeInTheDocument();
    });
  });
});

describe('CampaignForm', () => {
  const mockSubmit = jest.fn();
  const mockCancel = jest.fn();

  test('validates form inputs correctly', async () => {
    render(
      <CampaignForm
        onSubmit={mockSubmit}
        onCancel={mockCancel}
        aiModels={[{ id: 'GPT-4', name: 'GPT-4', capabilities: [] }]}
        voiceOptions={[
          { id: 'voice-1', name: 'Voice 1', provider: 'AWS' }
        ]}
      />
    );

    fireEvent.click(screen.getByText('Create Campaign'));

    await waitFor(() => {
      expect(screen.getByText(/Name is required/)).toBeInTheDocument();
    });
  });

  test('handles AI configuration changes', async () => {
    render(
      <CampaignForm
        onSubmit={mockSubmit}
        onCancel={mockCancel}
        aiModels={[{ id: 'GPT-4', name: 'GPT-4', capabilities: [] }]}
        voiceOptions={[
          { id: 'voice-1', name: 'Voice 1', provider: 'AWS' }
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText('AI Model'), {
      target: { value: 'GPT-4' }
    });

    fireEvent.click(screen.getByLabelText('Enable AI Optimization'));

    await waitFor(() => {
      expect(screen.getByLabelText('Optimization Target')).toBeEnabled();
    });
  });

  test('submits form data with proper validation', async () => {
    render(
      <CampaignForm
        onSubmit={mockSubmit}
        onCancel={mockCancel}
        aiModels={[{ id: 'GPT-4', name: 'GPT-4', capabilities: [] }]}
        voiceOptions={[
          { id: 'voice-1', name: 'Voice 1', provider: 'AWS' }
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText('Campaign Name'), {
      target: { value: 'Test Campaign' }
    });

    fireEvent.click(screen.getByText('Create Campaign'));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
  });
});