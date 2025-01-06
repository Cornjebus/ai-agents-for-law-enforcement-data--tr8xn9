'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';
import toast from 'react-hot-toast';
import { useConfirmNavigation } from 'next-navigation-guard';

import ContentForm from '../../../../components/content/ContentForm';
import { ContentService } from '../../../../services/content.service';
import { Content, ContentStatus } from '../../../../types/content';
import { DESIGN_SYSTEM } from '../../../../lib/constants';

// Error messages for user feedback
const ERROR_MESSAGES = {
  FETCH: 'Failed to load content. Please try again.',
  UPDATE: 'Failed to update content. Please try again.',
  VALIDATION: 'Please check the form for errors.',
  UNKNOWN: 'An unexpected error occurred. Please try again.'
} as const;

// Loading states for UI feedback
const LOADING_STATES = {
  INITIAL: 'INITIAL',
  LOADING: 'LOADING',
  SAVING: 'SAVING',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS'
} as const;

/**
 * Error Fallback component for error boundary
 */
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary
}) => (
  <div 
    className="error-container"
    style={{ 
      padding: DESIGN_SYSTEM.SPACING.lg,
      color: DESIGN_SYSTEM.COLORS.error 
    }}
  >
    <h2>Something went wrong:</h2>
    <pre>{error.message}</pre>
    <button
      onClick={resetErrorBoundary}
      style={{ 
        marginTop: DESIGN_SYSTEM.SPACING.md,
        padding: DESIGN_SYSTEM.SPACING.sm 
      }}
    >
      Try again
    </button>
  </div>
);

/**
 * Loading Skeleton component for content form
 */
const LoadingSkeleton: React.FC = () => (
  <div className="loading-skeleton" style={{ padding: DESIGN_SYSTEM.SPACING.lg }}>
    <div className="skeleton-line" style={{ width: '60%', height: '2rem' }} />
    <div className="skeleton-line" style={{ width: '100%', height: '10rem', marginTop: '1rem' }} />
    <div className="skeleton-line" style={{ width: '40%', height: '2rem', marginTop: '1rem' }} />
  </div>
);

/**
 * Content Edit Page Component
 * Provides AI-driven content editing capabilities with comprehensive error handling
 */
const ContentEditPage: React.FC<{ params: { id: string } }> = ({ params }) => {
  const router = useRouter();
  const contentService = new ContentService();
  const [content, setContent] = useState<Content | null>(null);
  const [loadingState, setLoadingState] = useState(LOADING_STATES.INITIAL);
  const [error, setError] = useState<string | null>(null);

  // Set up navigation guard for unsaved changes
  useConfirmNavigation({
    shouldBlock: () => loadingState === LOADING_STATES.SAVING,
    confirmMessage: 'You have unsaved changes. Are you sure you want to leave?'
  });

  // Fetch content data on mount
  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoadingState(LOADING_STATES.LOADING);
        const contentData = await contentService.getContent(params.id);
        setContent(contentData);
        setLoadingState(LOADING_STATES.SUCCESS);
      } catch (error) {
        console.error('Error fetching content:', error);
        setError(ERROR_MESSAGES.FETCH);
        setLoadingState(LOADING_STATES.ERROR);
        toast.error(ERROR_MESSAGES.FETCH);
      }
    };

    fetchContent();
  }, [params.id]);

  /**
   * Handles content update with validation and error handling
   */
  const handleUpdateContent = async (updatedContent: Content) => {
    try {
      setLoadingState(LOADING_STATES.SAVING);

      // Validate content before submission
      const validationResult = await contentService.validateContent(updatedContent);
      if (!validationResult.isValid) {
        toast.error(ERROR_MESSAGES.VALIDATION);
        return;
      }

      // Update content with optimistic update
      const previousContent = content;
      setContent(updatedContent);

      // Submit update to server
      const result = await contentService.updateContent(params.id, {
        ...updatedContent,
        status: ContentStatus.DRAFT,
        updatedAt: new Date()
      });

      setContent(result);
      setLoadingState(LOADING_STATES.SUCCESS);
      toast.success('Content updated successfully');

      // Navigate back to content view
      router.push(`/content/${params.id}`);
    } catch (error) {
      console.error('Error updating content:', error);
      // Rollback optimistic update
      setContent(previousContent);
      setLoadingState(LOADING_STATES.ERROR);
      toast.error(ERROR_MESSAGES.UPDATE);
    }
  };

  /**
   * Handles cancellation of editing
   */
  const handleCancel = () => {
    router.back();
  };

  // Show loading skeleton while fetching content
  if (loadingState === LOADING_STATES.LOADING || !content) {
    return <LoadingSkeleton />;
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        setError(null);
        setLoadingState(LOADING_STATES.INITIAL);
      }}
    >
      <div className="content-edit-page" style={{ padding: DESIGN_SYSTEM.SPACING.lg }}>
        <h1 style={{ 
          fontSize: DESIGN_SYSTEM.TYPOGRAPHY.fontSize['2xl'],
          marginBottom: DESIGN_SYSTEM.SPACING.lg 
        }}>
          Edit Content
        </h1>

        <ContentForm
          initialContent={content}
          campaignId={content.campaignId}
          onSubmit={handleUpdateContent}
          onCancel={handleCancel}
        />

        {error && (
          <div 
            className="error-message"
            style={{ 
              color: DESIGN_SYSTEM.COLORS.error,
              marginTop: DESIGN_SYSTEM.SPACING.md 
            }}
          >
            {error}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default ContentEditPage;