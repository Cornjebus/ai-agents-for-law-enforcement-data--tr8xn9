import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { axe } from '@axe-core/react';

import ContentEditor from '../../src/components/content/ContentEditor';
import ContentForm from '../../src/components/content/ContentForm';
import ContentList from '../../src/components/content/ContentList';
import { ContentType, ContentPlatform, ContentStatus } from '../../src/types/content';

// Mock hooks and services
vi.mock('../../hooks/useContent', () => ({
  useContent: () => ({
    generateContent: vi.fn(),
    optimizeContent: vi.fn(),
    isLoading: false,
    error: null,
    aiStatus: {}
  })
}));

// Mock data
const mockContent = {
  id: '123',
  type: ContentType.TEXT,
  platform: ContentPlatform.LINKEDIN,
  content: 'Test content',
  metadata: {
    title: 'Test Title',
    description: 'Test Description',
    keywords: ['test'],
    language: 'en',
    targetAudience: ['professionals'],
    aiModel: 'gpt-4',
    generationPrompt: 'Generate professional content'
  },
  status: ContentStatus.DRAFT,
  scheduledFor: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
};

// Test utilities
const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui);
};

describe('ContentEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with initial content and validates accessibility', async () => {
    const handleChange = vi.fn();
    const handleSave = vi.fn();

    const { container } = renderWithProviders(
      <ContentEditor
        initialContent={mockContent}
        platform={ContentPlatform.LINKEDIN}
        onChange={handleChange}
        onSave={handleSave}
        accessibility={{
          ariaLabel: 'Content editor',
          role: 'textbox'
        }}
      />
    );

    // Check accessibility
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify initial content
    expect(screen.getByRole('textbox')).toHaveValue(mockContent.content);
  });

  it('handles content editing with platform-specific validation', async () => {
    const handleChange = vi.fn();
    const handleSave = vi.fn();

    renderWithProviders(
      <ContentEditor
        platform={ContentPlatform.TWITTER}
        onChange={handleChange}
        onSave={handleSave}
      />
    );

    const editor = screen.getByRole('textbox');
    
    // Test Twitter character limit
    await userEvent.type(editor, 'a'.repeat(281));
    expect(screen.getByText(/exceeds maximum length/)).toBeInTheDocument();

    // Test hashtag limit
    await userEvent.type(editor, '#test1 #test2 #test3 #test4');
    expect(screen.getByText(/Maximum 3 hashtags allowed/)).toBeInTheDocument();
  });

  it('handles AI content generation with loading states', async () => {
    const handleChange = vi.fn();
    const handleSave = vi.fn();
    const mockGenerate = vi.fn().mockResolvedValue({
      content: 'AI generated content'
    });

    vi.mocked(useContent).mockImplementation(() => ({
      generateContent: mockGenerate,
      optimizeContent: vi.fn(),
      isLoading: true,
      error: null,
      aiStatus: { status: 'generating', progress: 50 }
    }));

    renderWithProviders(
      <ContentEditor
        platform={ContentPlatform.LINKEDIN}
        onChange={handleChange}
        onSave={handleSave}
      />
    );

    const generateButton = screen.getByRole('button', { name: /generate/i });
    await userEvent.click(generateButton);

    expect(screen.getByText(/generating/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled();
    });
  });
});

describe('ContentForm', () => {
  it('renders form with validation and accessibility support', async () => {
    const handleSubmit = vi.fn();
    const handleCancel = vi.fn();

    const { container } = renderWithProviders(
      <ContentForm
        campaignId="123"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    // Check accessibility
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify form fields
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/platform/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
  });

  it('handles form submission with validation', async () => {
    const handleSubmit = vi.fn();
    const handleCancel = vi.fn();

    renderWithProviders(
      <ContentForm
        campaignId="123"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    // Fill form with invalid data
    await userEvent.type(screen.getByLabelText(/title/i), '');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // Check validation errors
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();

    // Fill form with valid data
    await userEvent.type(screen.getByLabelText(/title/i), 'Test Title');
    await userEvent.type(screen.getByLabelText(/content/i), 'Test Content');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ title: 'Test Title' }),
        content: 'Test Content'
      }));
    });
  });
});

describe('ContentList', () => {
  const mockContentList = [mockContent];

  it('renders content list with sorting and filtering', async () => {
    const handleContentSelect = vi.fn();

    vi.mocked(useContent).mockImplementation(() => ({
      content: mockContentList,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    }));

    renderWithProviders(
      <ContentList
        onContentSelect={handleContentSelect}
      />
    );

    // Verify content rendering
    expect(screen.getByText(mockContent.metadata.title)).toBeInTheDocument();

    // Test sorting
    const titleHeader = screen.getByRole('columnheader', { name: /title/i });
    await userEvent.click(titleHeader);
    expect(handleContentSelect).not.toHaveBeenCalled();

    // Test content selection
    const editButton = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);
    expect(handleContentSelect).toHaveBeenCalledWith(mockContent);
  });

  it('handles loading and error states', async () => {
    vi.mocked(useContent).mockImplementation(() => ({
      content: [],
      isLoading: true,
      error: 'Failed to load content',
      refetch: vi.fn()
    }));

    renderWithProviders(
      <ContentList
        onContentSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/failed to load content/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('supports keyboard navigation and screen readers', async () => {
    const handleContentSelect = vi.fn();

    vi.mocked(useContent).mockImplementation(() => ({
      content: mockContentList,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    }));

    renderWithProviders(
      <ContentList
        onContentSelect={handleContentSelect}
      />
    );

    // Test keyboard navigation
    const editButton = screen.getByRole('button', { name: /edit/i });
    await userEvent.tab();
    expect(editButton).toHaveFocus();
    await userEvent.keyboard('{enter}');
    expect(handleContentSelect).toHaveBeenCalledWith(mockContent);
  });
});