/**
 * @fileoverview Advanced content form component with AI-driven content generation,
 * multi-platform validation, and scheduling capabilities
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { z } from 'zod'; // v3.22.0
import DatePicker from 'react-datepicker'; // v4.8.0
import { Form, useForm, SecurityLevel } from '../shared/Form';
import { Content, ContentType, ContentPlatform, ContentMetadata } from '../../types/content';
import { ContentService } from '../../services/content.service';
import { DESIGN_SYSTEM, AI_CONFIG } from '../../lib/constants';

// Platform-specific content validation schema
const VALIDATION_SCHEMA = z.object({
  type: z.nativeEnum(ContentType),
  platform: z.nativeEnum(ContentPlatform),
  content: z.string()
    .min(1, 'Content is required')
    .max(10000, 'Content exceeds maximum length')
    .refine((val) => {
      if (val.includes('<script')) return false;
      return true;
    }, 'Invalid content detected'),
  metadata: z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(1000),
    keywords: z.array(z.string()),
    language: z.string(),
    targetAudience: z.array(z.string()),
    aiModel: z.string(),
    generationPrompt: z.string().max(2000)
  }),
  scheduledFor: z.date().min(new Date(), 'Schedule date must be in the future')
});

// Platform-specific options with metadata
const PLATFORM_OPTIONS = [
  { value: ContentPlatform.LINKEDIN, label: 'LinkedIn', maxLength: 3000 },
  { value: ContentPlatform.TWITTER, label: 'Twitter', maxLength: 280 },
  { value: ContentPlatform.TIKTOK, label: 'TikTok', maxLength: 2200 },
  { value: ContentPlatform.EMAIL, label: 'Email', maxLength: 10000 },
  { value: ContentPlatform.VOICE, label: 'Voice', maxLength: 5000 }
];

const CONTENT_TYPE_OPTIONS = [
  { value: ContentType.TEXT, label: 'Text' },
  { value: ContentType.IMAGE, label: 'Image' },
  { value: ContentType.AUDIO, label: 'Audio' },
  { value: ContentType.DOCUMENT, label: 'Document' }
];

// Props interface for the ContentForm component
interface ContentFormProps {
  initialContent?: Partial<Content>;
  campaignId: string;
  onSubmit: (content: Content) => Promise<void>;
  onCancel: () => void;
}

/**
 * Advanced content form component with AI generation and validation
 */
const ContentForm: React.FC<ContentFormProps> = ({
  initialContent,
  campaignId,
  onSubmit,
  onCancel
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<ContentPlatform | null>(
    initialContent?.platform || null
  );

  const form = useForm({
    validationSchema: VALIDATION_SCHEMA,
    initialValues: {
      type: initialContent?.type || ContentType.TEXT,
      platform: initialContent?.platform || ContentPlatform.LINKEDIN,
      content: initialContent?.content || '',
      metadata: initialContent?.metadata || {
        title: '',
        description: '',
        keywords: [],
        language: 'en',
        targetAudience: [],
        aiModel: AI_CONFIG.LLM_SETTINGS.model,
        generationPrompt: ''
      },
      scheduledFor: initialContent?.scheduledFor || new Date()
    }
  });

  // Handle platform-specific validation and UI updates
  const handlePlatformChange = useCallback((platform: ContentPlatform) => {
    setSelectedPlatform(platform);
    form.setFieldValue('platform', platform);
    
    // Reset content if it exceeds platform limits
    const platformConfig = PLATFORM_OPTIONS.find(p => p.value === platform);
    if (platformConfig && form.values.content.length > platformConfig.maxLength) {
      form.setFieldValue('content', '');
      form.setFieldError('content', `Content exceeds ${platform} limit of ${platformConfig.maxLength} characters`);
    }
  }, [form]);

  // AI content generation handler
  const handleGenerateContent = useCallback(async () => {
    try {
      setIsGenerating(true);
      const contentService = new ContentService();
      
      const generatedContent = await contentService.generateContent(
        form.values.metadata,
        {
          model: AI_CONFIG.LLM_SETTINGS.model,
          temperature: AI_CONFIG.LLM_SETTINGS.temperature,
          maxTokens: AI_CONFIG.LLM_SETTINGS.maxTokens,
          contextWindow: AI_CONFIG.MODEL_DEFAULTS[form.values.platform].contextWindow,
          targetPlatform: form.values.platform
        }
      );

      form.setFieldValue('content', generatedContent.content);
    } catch (error) {
      form.setFieldError('content', 'Failed to generate content: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  }, [form.values.metadata, form.values.platform]);

  // Form submission handler
  const handleSubmit = useCallback(async (data: any) => {
    try {
      const contentData: Content = {
        ...data,
        campaignId,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        aiGeneratedAt: isGenerating ? new Date() : null,
        reviewedAt: null,
        metrics: {
          impressions: 0,
          engagements: 0,
          clicks: 0,
          conversions: 0,
          performance: [],
          aiPerformance: []
        }
      };

      await onSubmit(contentData);
    } catch (error) {
      console.error('Content submission error:', error);
      throw error;
    }
  }, [campaignId, isGenerating, onSubmit]);

  return (
    <Form
      onSubmit={handleSubmit}
      className="content-form"
      enableAIValidation
      securityLevel={SecurityLevel.ENHANCED}
      accessibilityConfig={{
        ariaLabel: 'Content creation form',
        focusOnMount: true
      }}
    >
      <div className="form-grid" style={{ gap: DESIGN_SYSTEM.SPACING.md }}>
        {/* Content Type Selection */}
        <div className="form-field">
          <label htmlFor="type">Content Type</label>
          <select
            id="type"
            value={form.values.type}
            onChange={(e) => form.setFieldValue('type', e.target.value)}
            className="form-select"
          >
            {CONTENT_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.errors.type && (
            <span className="error-message">{form.errors.type}</span>
          )}
        </div>

        {/* Platform Selection */}
        <div className="form-field">
          <label htmlFor="platform">Platform</label>
          <select
            id="platform"
            value={form.values.platform}
            onChange={(e) => handlePlatformChange(e.target.value as ContentPlatform)}
            className="form-select"
          >
            {PLATFORM_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.errors.platform && (
            <span className="error-message">{form.errors.platform}</span>
          )}
        </div>

        {/* Content Metadata */}
        <div className="form-field">
          <label htmlFor="metadata.title">Title</label>
          <input
            id="metadata.title"
            type="text"
            value={form.values.metadata.title}
            onChange={(e) => form.setFieldValue('metadata.title', e.target.value)}
            className="form-input"
            maxLength={200}
          />
          {form.errors['metadata.title'] && (
            <span className="error-message">{form.errors['metadata.title']}</span>
          )}
        </div>

        {/* AI Generation Controls */}
        <div className="form-field">
          <label htmlFor="metadata.generationPrompt">AI Generation Prompt</label>
          <textarea
            id="metadata.generationPrompt"
            value={form.values.metadata.generationPrompt}
            onChange={(e) => form.setFieldValue('metadata.generationPrompt', e.target.value)}
            className="form-textarea"
            rows={4}
            maxLength={2000}
          />
          <button
            type="button"
            onClick={handleGenerateContent}
            disabled={isGenerating || !form.values.metadata.generationPrompt}
            className="generate-button"
          >
            {isGenerating ? 'Generating...' : 'Generate Content'}
          </button>
        </div>

        {/* Content Editor */}
        <div className="form-field">
          <label htmlFor="content">Content</label>
          <textarea
            id="content"
            value={form.values.content}
            onChange={(e) => form.setFieldValue('content', e.target.value)}
            className="form-textarea"
            rows={8}
            maxLength={selectedPlatform ? 
              PLATFORM_OPTIONS.find(p => p.value === selectedPlatform)?.maxLength : 
              10000
            }
          />
          {form.errors.content && (
            <span className="error-message">{form.errors.content}</span>
          )}
          {selectedPlatform && (
            <span className="character-count">
              {form.values.content.length} / 
              {PLATFORM_OPTIONS.find(p => p.value === selectedPlatform)?.maxLength} characters
            </span>
          )}
        </div>

        {/* Schedule Picker */}
        <div className="form-field">
          <label htmlFor="scheduledFor">Schedule Publication</label>
          <DatePicker
            id="scheduledFor"
            selected={form.values.scheduledFor}
            onChange={(date) => form.setFieldValue('scheduledFor', date)}
            showTimeSelect
            dateFormat="MMMM d, yyyy h:mm aa"
            minDate={new Date()}
            className="form-input"
          />
          {form.errors.scheduledFor && (
            <span className="error-message">{form.errors.scheduledFor}</span>
          )}
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button type="button" onClick={onCancel} className="cancel-button">
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={!form.isValid || form.isSubmitting}
            className="submit-button"
          >
            {form.isSubmitting ? 'Saving...' : 'Save Content'}
          </button>
        </div>
      </div>
    </Form>
  );
};

export default ContentForm;