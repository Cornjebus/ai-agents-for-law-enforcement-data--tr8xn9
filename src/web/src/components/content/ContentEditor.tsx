import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Editor } from '@tiptap/react'; // v2.1.0
import { z } from 'zod'; // v3.22.0
import { Content, ContentType, ContentPlatform, ContentStatus } from '../../types/content';
import Form from '../shared/Form';
import { useContent } from '../../hooks/useContent';
import { DESIGN_SYSTEM, AI_CONFIG } from '../../lib/constants';

// Platform-specific content validation schema
const CONTENT_VALIDATION_SCHEMA = z.object({
  text: z.string().min(1).max(2000),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  keywords: z.array(z.string()).max(10).optional(),
  platform: z.nativeEnum(ContentPlatform)
});

// Platform-specific content limits
const PLATFORM_LIMITS: Record<ContentPlatform, { maxLength: number; maxHashtags: number }> = {
  [ContentPlatform.TWITTER]: { maxLength: 280, maxHashtags: 3 },
  [ContentPlatform.LINKEDIN]: { maxLength: 3000, maxHashtags: 5 },
  [ContentPlatform.TIKTOK]: { maxLength: 2200, maxHashtags: 10 },
  [ContentPlatform.EMAIL]: { maxLength: 10000, maxHashtags: 0 },
  [ContentPlatform.VOICE]: { maxLength: 5000, maxHashtags: 0 }
};

// Editor configuration by platform
const EDITOR_CONFIG = {
  [ContentPlatform.TWITTER]: {
    placeholder: 'Write your tweet...',
    extensions: ['mention', 'hashtag', 'link'],
    toolbar: ['bold', 'italic', 'link']
  },
  [ContentPlatform.LINKEDIN]: {
    placeholder: 'Write your LinkedIn post...',
    extensions: ['mention', 'hashtag', 'link', 'image'],
    toolbar: ['bold', 'italic', 'link', 'bulletList', 'orderedList']
  },
  [ContentPlatform.TIKTOK]: {
    placeholder: 'Write your TikTok caption...',
    extensions: ['mention', 'hashtag', 'emoji'],
    toolbar: ['emoji']
  },
  [ContentPlatform.EMAIL]: {
    placeholder: 'Write your email content...',
    extensions: ['paragraph', 'heading', 'link', 'image'],
    toolbar: ['bold', 'italic', 'link', 'bulletList', 'orderedList', 'h1', 'h2', 'h3']
  },
  [ContentPlatform.VOICE]: {
    placeholder: 'Write your voice script...',
    extensions: ['paragraph', 'emphasis'],
    toolbar: ['bold', 'italic', 'emphasis']
  }
};

// Interface for component props
interface ContentEditorProps {
  initialContent?: Content;
  platform: ContentPlatform;
  onChange: (content: Content) => void;
  onSave: (content: Content) => Promise<void>;
  onOptimize?: (content: Content) => Promise<void>;
  className?: string;
  accessibility?: {
    ariaLabel?: string;
    ariaDescribedBy?: string;
    role?: string;
  };
}

/**
 * Enhanced content editor component with AI-driven content generation and platform-specific validation
 */
const ContentEditor: React.FC<ContentEditorProps> = ({
  initialContent,
  platform,
  onChange,
  onSave,
  onOptimize,
  className,
  accessibility
}) => {
  // Refs and state
  const editorRef = useRef<Editor | null>(null);
  const [content, setContent] = useState<string>(initialContent?.content || '');
  const [isValid, setIsValid] = useState<boolean>(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // Custom hooks
  const { 
    generateContent, 
    optimizeContent, 
    isLoading, 
    error, 
    aiStatus 
  } = useContent();

  /**
   * Validates content against platform-specific rules
   */
  const validateContent = useCallback((text: string): boolean => {
    try {
      const limits = PLATFORM_LIMITS[platform];
      const errors: string[] = [];

      if (text.length > limits.maxLength) {
        errors.push(`Content exceeds maximum length of ${limits.maxLength} characters`);
      }

      const hashtagCount = (text.match(/#\w+/g) || []).length;
      if (hashtagCount > limits.maxHashtags) {
        errors.push(`Maximum ${limits.maxHashtags} hashtags allowed`);
      }

      // Platform-specific validation
      if (platform === ContentPlatform.TWITTER) {
        const urlCount = (text.match(/https?:\/\/[^\s]+/g) || []).length;
        if (urlCount > 1) {
          errors.push('Twitter allows only one URL per tweet');
        }
      }

      setValidationErrors(errors);
      return errors.length === 0;
    } catch (error) {
      console.error('Content validation error:', error);
      return false;
    }
  }, [platform]);

  /**
   * Handles content changes with debounced validation
   */
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    const isValidContent = validateContent(newContent);
    setIsValid(isValidContent);

    onChange({
      ...initialContent,
      content: newContent,
      type: ContentType.TEXT,
      platform,
      status: ContentStatus.DRAFT,
      updatedAt: new Date()
    });
  }, [initialContent, onChange, platform, validateContent]);

  /**
   * Handles AI-driven content generation
   */
  const handleAIGenerate = useCallback(async () => {
    try {
      const result = await generateContent({
        type: ContentType.TEXT,
        platform,
        metadata: {
          title: initialContent?.metadata?.title || '',
          description: initialContent?.metadata?.description || '',
          keywords: initialContent?.metadata?.keywords || [],
          targetAudience: initialContent?.metadata?.targetAudience || [],
          aiModel: AI_CONFIG.LLM_SETTINGS.model,
          generationPrompt: `Generate ${platform.toLowerCase()} content about ${initialContent?.metadata?.description}`
        }
      });

      if (result) {
        handleContentChange(result.content);
      }
    } catch (error) {
      console.error('AI generation error:', error);
    }
  }, [generateContent, platform, initialContent, handleContentChange]);

  /**
   * Handles content optimization
   */
  const handleOptimize = useCallback(async () => {
    if (!content || !onOptimize) return;

    try {
      const optimizedContent = await optimizeContent(initialContent?.id || '', platform);
      if (optimizedContent) {
        handleContentChange(optimizedContent.content);
      }
    } catch (error) {
      console.error('Content optimization error:', error);
    }
  }, [content, onOptimize, optimizeContent, platform, initialContent, handleContentChange]);

  /**
   * Handles content saving with validation
   */
  const handleSave = useCallback(async () => {
    if (!isValid || !content) return;

    try {
      await onSave({
        ...initialContent,
        content,
        type: ContentType.TEXT,
        platform,
        status: ContentStatus.PENDING_APPROVAL,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Save error:', error);
    }
  }, [content, isValid, onSave, initialContent, platform]);

  return (
    <div 
      className={`content-editor ${className || ''}`}
      style={{ fontFamily: DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary }}
    >
      <Form
        onSubmit={handleSave}
        validationSchema={CONTENT_VALIDATION_SCHEMA}
        accessibilityConfig={accessibility}
      >
        <div className="editor-toolbar">
          {EDITOR_CONFIG[platform].toolbar.map((tool) => (
            <button
              key={tool}
              onClick={() => editorRef.current?.chain().focus()[tool]().run()}
              className="toolbar-button"
              aria-label={`Format ${tool}`}
            >
              {tool}
            </button>
          ))}
        </div>

        <Editor
          ref={editorRef}
          content={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={EDITOR_CONFIG[platform].placeholder}
          extensions={EDITOR_CONFIG[platform].extensions}
          editorProps={{
            attributes: {
              class: 'content-editor__input',
              'aria-label': accessibility?.ariaLabel || 'Content editor',
              'aria-describedby': accessibility?.ariaDescribedBy
            }
          }}
        />

        <div className="content-controls">
          <div className="character-count">
            {content.length} / {PLATFORM_LIMITS[platform].maxLength}
          </div>

          {validationErrors.length > 0 && (
            <div className="validation-errors" role="alert">
              {validationErrors.map((error, index) => (
                <p key={index} className="error-message">{error}</p>
              ))}
            </div>
          )}

          <div className="action-buttons">
            <button
              onClick={handleAIGenerate}
              disabled={isLoading}
              className="ai-generate-button"
              aria-label="Generate content with AI"
            >
              {isLoading ? 'Generating...' : 'AI Generate'}
            </button>

            {onOptimize && (
              <button
                onClick={handleOptimize}
                disabled={!content || isLoading}
                className="optimize-button"
                aria-label="Optimize content"
              >
                Optimize
              </button>
            )}

            <button
              onClick={() => setShowPreview(!showPreview)}
              className="preview-button"
              aria-label="Toggle preview"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>

            <button
              onClick={handleSave}
              disabled={!isValid || !content || isLoading}
              className="save-button"
              aria-label="Save content"
            >
              Save
            </button>
          </div>
        </div>

        {showPreview && (
          <div className="content-preview" role="region" aria-label="Content preview">
            <div className={`preview-${platform.toLowerCase()}`}>
              {content}
            </div>
          </div>
        )}
      </Form>
    </div>
  );
};

export default ContentEditor;