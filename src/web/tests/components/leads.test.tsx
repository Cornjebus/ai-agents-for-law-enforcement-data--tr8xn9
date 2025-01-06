import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { axe } from '@axe-core/react';
import { useWebSocket } from 'react-use-websocket';
import { useAIService } from '@ai-service/react';

import LeadCard from '../../src/components/leads/LeadCard';
import LeadList from '../../src/components/leads/LeadList';
import LeadScore from '../../src/components/leads/LeadScore';
import LeadForm from '../../src/components/leads/LeadForm';
import { LeadStatus, LeadSource } from '../../src/types/lead';

// Mock hooks and services
vi.mock('react-use-websocket');
vi.mock('@ai-service/react');
vi.mock('@auth/hooks', () => ({
  useRoleAccess: () => ({
    hasPermission: (permission: string) => true
  })
}));

// Mock lead data generator
const mockLead = (overrides = {}) => ({
  id: 'test-lead-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  company: 'Test Corp',
  title: 'CEO',
  status: LeadStatus.NEW,
  source: LeadSource.WEBSITE,
  score: 85,
  aiScore: {
    overall: 85,
    engagement: 80,
    intent: 90,
    budget: 85,
    lastUpdated: new Date()
  },
  metadata: {
    industry: 'Technology',
    companySize: '50-100',
    budget: '$10k-50k',
    timeline: 'Q3 2023'
  },
  interactions: [
    {
      id: 'int-1',
      type: 'call',
      timestamp: new Date(),
      sentiment: 0.8
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

// Enhanced render utility with providers
const renderWithProviders = (ui: React.ReactElement, options = {}) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  );
  return render(ui, { wrapper: Wrapper, ...options });
};

// Performance measurement utility
const mockPerformanceTimer = (callback: () => void) => {
  const start = performance.now();
  callback();
  return performance.now() - start;
};

describe('LeadCard Component', () => {
  it('renders lead information correctly', () => {
    const lead = mockLead();
    renderWithProviders(
      <LeadCard
        lead={lead}
        onCall={vi.fn()}
        onEdit={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );

    expect(screen.getByText(`${lead.firstName} ${lead.lastName}`)).toBeInTheDocument();
    expect(screen.getByText(lead.company)).toBeInTheDocument();
    expect(screen.getByText(lead.email)).toBeInTheDocument();
  });

  it('handles real-time updates via WebSocket', async () => {
    const lead = mockLead();
    const onCall = vi.fn();
    
    renderWithProviders(
      <LeadCard
        lead={lead}
        onCall={onCall}
        onEdit={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );

    // Simulate WebSocket update
    const wsUpdate = {
      id: lead.id,
      score: 90,
      status: LeadStatus.QUALIFIED
    };

    (useWebSocket as any).mockImplementation(() => ({
      lastMessage: { data: JSON.stringify(wsUpdate) }
    }));

    await waitFor(() => {
      expect(screen.getByText('90')).toBeInTheDocument();
      expect(screen.getByText(LeadStatus.QUALIFIED)).toBeInTheDocument();
    });
  });

  it('maintains accessibility compliance', async () => {
    const lead = mockLead();
    const { container } = renderWithProviders(
      <LeadCard
        lead={lead}
        onCall={vi.fn()}
        onEdit={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('LeadList Component', () => {
  const mockLeads = [mockLead(), mockLead({ id: 'test-lead-2', firstName: 'Jane' })];

  it('implements virtual scrolling for performance', async () => {
    const renderTime = mockPerformanceTimer(() => {
      renderWithProviders(
        <LeadList
          viewType="table"
          onViewTypeChange={vi.fn()}
          pageSize={25}
          filters={{}}
          sortConfig={{ key: 'firstName', direction: 'asc' }}
          onFilterChange={vi.fn()}
          onSortChange={vi.fn()}
        />
      );
    });

    expect(renderTime).toBeLessThan(200); // Performance benchmark
  });

  it('handles real-time lead updates', async () => {
    renderWithProviders(
      <LeadList
        viewType="table"
        onViewTypeChange={vi.fn()}
        pageSize={25}
        filters={{}}
        sortConfig={{ key: 'firstName', direction: 'asc' }}
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    );

    // Simulate real-time update
    const wsUpdate = {
      type: 'lead_update',
      data: mockLead({ score: 95 })
    };

    (useWebSocket as any).mockImplementation(() => ({
      lastMessage: { data: JSON.stringify(wsUpdate) }
    }));

    await waitFor(() => {
      expect(screen.getByText('95')).toBeInTheDocument();
    });
  });

  it('applies filters with AI recommendations', async () => {
    const onFilterChange = vi.fn();
    renderWithProviders(
      <LeadList
        viewType="table"
        onViewTypeChange={vi.fn()}
        pageSize={25}
        filters={{}}
        sortConfig={{ key: 'firstName', direction: 'asc' }}
        onFilterChange={onFilterChange}
        onSortChange={vi.fn()}
      />
    );

    // Simulate AI recommendation
    (useAIService as any).mockImplementation(() => ({
      getRecommendedFilters: () => ({
        status: [LeadStatus.QUALIFIED],
        scoreRange: { min: 70, max: 100 }
      })
    }));

    const filterButton = screen.getByRole('button', { name: /filter/i });
    await userEvent.click(filterButton);

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({
        status: [LeadStatus.QUALIFIED],
        scoreRange: { min: 70, max: 100 }
      }));
    });
  });
});

describe('LeadScore Component', () => {
  it('displays AI-driven score metrics', () => {
    const lead = mockLead();
    renderWithProviders(
      <LeadScore
        lead={lead}
        showTrend={true}
      />
    );

    expect(screen.getByText(lead.aiScore.overall.toString())).toBeInTheDocument();
    expect(screen.getByText('Lead Quality Score')).toBeInTheDocument();
  });

  it('updates score in real-time', async () => {
    const lead = mockLead();
    renderWithProviders(
      <LeadScore
        lead={lead}
        showTrend={true}
        refreshInterval={1000}
      />
    );

    // Simulate score update
    const newScore = 95;
    (useWebSocket as any).mockImplementation(() => ({
      lastMessage: { data: JSON.stringify({ score: newScore }) }
    }));

    await waitFor(() => {
      expect(screen.getByText(newScore.toString())).toBeInTheDocument();
    });
  });
});

describe('LeadForm Component', () => {
  it('validates form fields with AI enhancement', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <LeadForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        aiEnabled={true}
      />
    );

    // Fill form with invalid data
    await userEvent.type(screen.getByLabelText(/first name/i), 'J');
    await userEvent.type(screen.getByLabelText(/email/i), 'invalid-email');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /create lead/i });
    await userEvent.click(submitButton);

    // Verify AI validation
    await waitFor(() => {
      expect(screen.getByText(/first name.*too short/i)).toBeInTheDocument();
      expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
    });
  });

  it('handles AI score updates during form completion', async () => {
    renderWithProviders(
      <LeadForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        aiEnabled={true}
      />
    );

    // Mock AI service response
    (useAIService as any).mockImplementation(() => ({
      getLeadScore: () => ({
        overall: 85,
        engagement: 80,
        intent: 90,
        budget: 85
      })
    }));

    // Fill form
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/company/i), 'Test Corp');

    // Verify AI score update
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
    });
  });
});