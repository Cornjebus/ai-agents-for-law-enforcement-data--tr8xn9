'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast'; // v2.4.1
import ContentForm from '../../../components/content/ContentForm';
import { ContentService } from '../../../services/content.service';
import { Content, ContentMetadata, PlatformConfig } from '../../../types/content';
import { DESIGN_SYSTEM, AI_CONFIG } from '../../../lib/constants';

/**
 * Advanced content creation page with AI-driven generation and multi-platform distribution
 */
const CreateContentPage: React.FC = () => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  /**
   * Handles content form submission with validation and distribution
   */
  const handleContentSubmit = useCallback(async (contentData: Content) => {
    const contentService = new ContentService();
    const toastId = toast.loading('Creating content...', {
      style: {
        background: DESIGN_SYSTEM.COLORS.gray[800],
        color: DESIGN_SYSTEM.COLORS.gray[100],
      },
    });

    try {
      setIsSubmitting(true);

      // Validate content against platform rules
      const validationResult = await contentService.validateContent(contentData);
      if (!validationResult.isValid) {
        throw new Error(`Content validation failed: ${validationResult.errors?.join(', ')}`);
      }

      // Create content with AI optimization
      const createdContent = await contentService.createContent({
        ...contentData,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        metrics: {
          impressions: 0,
          engagements: 0,
          clicks: 0,
          conversions: 0,
          performance: [],
          aiPerformance: []
        }
      });

      // Preview content for selected platforms
      const previewResult = await contentService.previewContent(createdContent.id);
      
      // Show success message with preview link
      toast.success(
        <div>
          <p>Content created successfully!</p>
          <p className="text-sm">
            Preview available for {previewResult.platforms.length} platforms
          </p>
        </div>,
        {
          id: toastId,
          duration: 5000,
          style: {
            background: DESIGN_SYSTEM.COLORS.success,
            color: DESIGN_SYSTEM.COLORS.gray[100],
          },
        }
      );

      // Navigate to content list
      router.push('/content');
    } catch (error) {
      console.error('Content creation error:', error);
      toast.error(
        `Failed to create content: ${error.message}`,
        {
          id: toastId,
          duration: 5000,
          style: {
            background: DESIGN_SYSTEM.COLORS.error,
            color: DESIGN_SYSTEM.COLORS.gray[100],
          },
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [router]);

  /**
   * Handles AI-driven content generation with platform optimization
   */
  const handleAIGenerate = useCallback(async (
    metadata: ContentMetadata,
    platformConfig: PlatformConfig
  ) => {
    const contentService = new ContentService();
    const toastId = toast.loading('Generating content with AI...', {
      style: {
        background: DESIGN_SYSTEM.COLORS.gray[800],
        color: DESIGN_SYSTEM.COLORS.gray[100],
      },
    });

    try {
      setIsGenerating(true);

      // Generate content using AI
      const generatedContent = await contentService.generateContent(
        metadata,
        {
          model: AI_CONFIG.LLM_SETTINGS.model,
          temperature: AI_CONFIG.LLM_SETTINGS.temperature,
          maxTokens: AI_CONFIG.LLM_SETTINGS.maxTokens,
          contextWindow: AI_CONFIG.MODEL_DEFAULTS[metadata.platform].contextWindow,
          targetPlatform: metadata.platform
        }
      );

      toast.success('Content generated successfully!', {
        id: toastId,
        duration: 3000,
        style: {
          background: DESIGN_SYSTEM.COLORS.success,
          color: DESIGN_SYSTEM.COLORS.gray[100],
        },
      });

      return generatedContent;
    } catch (error) {
      console.error('AI generation error:', error);
      toast.error(
        `Failed to generate content: ${error.message}`,
        {
          id: toastId,
          duration: 5000,
          style: {
            background: DESIGN_SYSTEM.COLORS.error,
            color: DESIGN_SYSTEM.COLORS.gray[100],
          },
        }
      );
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Handles form cancellation and navigation
   */
  const handleCancel = useCallback(() => {
    router.push('/content');
  }, [router]);

  return (
    <div className="content-create-page" style={{ padding: DESIGN_SYSTEM.SPACING.lg }}>
      <h1 className="text-2xl font-semibold mb-6" style={{ 
        color: DESIGN_SYSTEM.COLORS.gray[900],
        fontFamily: DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary 
      }}>
        Create New Content
      </h1>

      <div className="content-form-container" style={{ 
        background: DESIGN_SYSTEM.COLORS.gray[50],
        borderRadius: '8px',
        padding: DESIGN_SYSTEM.SPACING.lg,
        boxShadow: DESIGN_SYSTEM.SHADOWS.sm 
      }}>
        <ContentForm
          onSubmit={handleContentSubmit}
          onCancel={handleCancel}
          onAIGenerate={handleAIGenerate}
          isSubmitting={isSubmitting}
          isGenerating={isGenerating}
          campaignId={''} // Set from route params or context
        />
      </div>
    </div>
  );
};

export default CreateContentPage;