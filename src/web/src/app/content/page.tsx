'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Analytics } from '@segment/analytics-next';
import { ErrorBoundary } from 'react-error-boundary';

import ContentList from '../../components/content/ContentList';
import ContentForm from '../../components/content/ContentForm';
import Button from '../../components/shared/Button';
import ContentPreview from '../../components/content/ContentPreview';
import { useContent } from '../../hooks/useContent';
import { Content, ContentStatus } from '../../types/content';
import { DESIGN_SYSTEM } from '../../lib/constants';

// Analytics instance
const analytics = new Analytics({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY || ''
});

interface ContentPageState {
  isFormOpen: boolean;
  selectedContent: Content | null;
  previewContent: Content | null;
  aiGenerationProgress: number;
}

const ContentPage: React.FC = () => {
  // State management
  const [state, setState] = useState<ContentPageState>({
    isFormOpen: false,
    selectedContent: null,
    previewContent: null,
    aiGenerationProgress: 0
  });

  // Custom hooks
  const {
    content,
    metrics,
    aiStatus,
    isLoading,
    error,
    generateContent,
    distributeContent,
    optimizeContent
  } = useContent();

  // Virtualization for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: Object.keys(content || {}).length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => 60, []),
    overscan: 5
  });

  // Track page view
  useEffect(() => {
    analytics.page('Content Management');
  }, []);

  // Handle content creation
  const handleCreateContent = useCallback(async (contentData: Partial<Content>) => {
    try {
      setState(prev => ({ ...prev, isFormOpen: false }));
      
      // Track content creation start
      analytics.track('Content Creation Started', {
        platform: contentData.platform,
        type: contentData.type,
        isAIGenerated: !!contentData.metadata?.generationPrompt
      });

      // Generate content if AI prompt is provided
      if (contentData.metadata?.generationPrompt) {
        const generatedContent = await generateContent({
          ...contentData,
          status: ContentStatus.DRAFT
        });

        setState(prev => ({ 
          ...prev, 
          previewContent: generatedContent,
          aiGenerationProgress: 100
        }));

        // Track successful AI generation
        analytics.track('Content AI Generation Success', {
          contentId: generatedContent.id,
          platform: generatedContent.platform,
          generationTime: Date.now() - new Date(generatedContent.aiGeneratedAt).getTime()
        });
      }
    } catch (error) {
      console.error('Content creation error:', error);
      analytics.track('Content Creation Error', { error: error.message });
      throw error;
    }
  }, [generateContent]);

  // Handle content editing
  const handleEditContent = useCallback(async (contentData: Content) => {
    try {
      setState(prev => ({ ...prev, isFormOpen: false }));

      // Optimize content for platform if needed
      if (contentData.platform !== state.selectedContent?.platform) {
        const optimizedContent = await optimizeContent(contentData.id, contentData.platform);
        setState(prev => ({ ...prev, previewContent: optimizedContent }));
      }

      // Track content update
      analytics.track('Content Updated', {
        contentId: contentData.id,
        platform: contentData.platform,
        status: contentData.status
      });
    } catch (error) {
      console.error('Content edit error:', error);
      analytics.track('Content Edit Error', { error: error.message });
      throw error;
    }
  }, [state.selectedContent, optimizeContent]);

  // Handle content distribution
  const handleDistributeContent = useCallback(async (content: Content) => {
    try {
      await distributeContent(content.id, {
        platforms: [content.platform],
        scheduledFor: content.scheduledFor
      });

      analytics.track('Content Distribution Success', {
        contentId: content.id,
        platform: content.platform,
        scheduledFor: content.scheduledFor
      });
    } catch (error) {
      console.error('Content distribution error:', error);
      analytics.track('Content Distribution Error', { error: error.message });
      throw error;
    }
  }, [distributeContent]);

  return (
    <div className="container mx-auto px-4 py-8">
      <ErrorBoundary
        fallback={<div className="text-error-500">Error loading content management</div>}
        onError={(error) => {
          analytics.track('Content Page Error', { error: error.message });
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
          <Button
            variant="primary"
            size="lg"
            onClick={() => setState(prev => ({ ...prev, isFormOpen: true }))}
            startIcon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Create Content
          </Button>
        </div>

        {/* Content List */}
        <div ref={parentRef} className="bg-white rounded-lg shadow">
          <ContentList
            onContentSelect={(content) => setState(prev => ({ 
              ...prev, 
              selectedContent: content,
              isFormOpen: true 
            }))}
            className="min-h-[600px]"
          />
        </div>

        {/* Content Form Modal */}
        {state.isFormOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50">
            <div className="flex items-center justify-center min-h-screen p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl">
                <div className="flex justify-between items-center p-6 border-b">
                  <h2 className="text-xl font-semibold">
                    {state.selectedContent ? 'Edit Content' : 'Create Content'}
                  </h2>
                  <Button
                    variant="ghost"
                    onClick={() => setState(prev => ({ ...prev, isFormOpen: false }))}
                    aria-label="Close"
                  >
                    ×
                  </Button>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6">
                    <ContentForm
                      initialContent={state.selectedContent || undefined}
                      campaignId="default"
                      onSubmit={state.selectedContent ? handleEditContent : handleCreateContent}
                      onCancel={() => setState(prev => ({ ...prev, isFormOpen: false }))}
                    />
                    {state.previewContent && (
                      <ContentPreview
                        content={state.previewContent}
                        showMetadata
                        className="sticky top-6"
                        onPreviewError={(error) => {
                          analytics.track('Content Preview Error', { error });
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default ContentPage;