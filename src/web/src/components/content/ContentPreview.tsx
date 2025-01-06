import React from 'react';
import clsx from 'clsx';
import { Content, ContentType, ContentPlatform } from '../../types/content';
import Card from '../shared/Card';
import { DESIGN_SYSTEM } from '../../lib/constants';

interface PreviewError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

interface ContentPreviewProps {
  content: Content;
  className?: string;
  showMetadata?: boolean;
  direction?: 'rtl' | 'ltr';
  onPreviewError?: (error: PreviewError) => void;
}

// Platform-specific styling configurations
const PLATFORM_STYLES = {
  [ContentPlatform.LINKEDIN]: {
    container: 'max-w-[550px] font-sans',
    content: 'text-[14px] leading-relaxed',
    metadata: 'text-gray-500 text-sm mt-2',
  },
  [ContentPlatform.TWITTER]: {
    container: 'max-w-[500px] font-sans',
    content: 'text-[15px] leading-normal',
    metadata: 'text-gray-600 text-sm mt-2',
  },
  [ContentPlatform.TIKTOK]: {
    container: 'max-w-[450px] font-sans',
    content: 'text-[16px] leading-tight',
    metadata: 'text-gray-400 text-sm mt-2',
  },
  [ContentPlatform.EMAIL]: {
    container: 'max-w-[600px] font-serif',
    content: 'text-[16px] leading-relaxed',
    metadata: 'text-gray-500 text-sm mt-3',
  },
  [ContentPlatform.VOICE]: {
    container: 'max-w-[500px] font-sans',
    content: 'text-[15px] leading-relaxed',
    metadata: 'text-gray-600 text-sm mt-2',
  },
} as const;

// Preview dimensions for different platforms
const PREVIEW_DIMENSIONS = {
  [ContentPlatform.LINKEDIN]: { maxChars: 3000, maxLines: 25 },
  [ContentPlatform.TWITTER]: { maxChars: 280, maxLines: 10 },
  [ContentPlatform.TIKTOK]: { maxChars: 2200, maxLines: 15 },
  [ContentPlatform.EMAIL]: { maxChars: 10000, maxLines: 50 },
  [ContentPlatform.VOICE]: { maxDuration: 300 }, // seconds
} as const;

const formatContentForPlatform = (
  content: string,
  platform: ContentPlatform,
  type: ContentType
): string => {
  const maxChars = PREVIEW_DIMENSIONS[platform].maxChars;
  let formattedContent = content;

  // Apply platform-specific formatting
  switch (platform) {
    case ContentPlatform.TWITTER:
      formattedContent = formattedContent
        .replace(/(#\w+)/g, '<span class="text-primary-600">$1</span>')
        .replace(/(@\w+)/g, '<span class="text-primary-600">$1</span>');
      break;
    case ContentPlatform.LINKEDIN:
      formattedContent = formattedContent
        .replace(/(#\w+)/g, '<span class="text-primary-600">$1</span>')
        .replace(/(@\w+)/g, '<span class="text-primary-600">$1</span>')
        .replace(/\n{3,}/g, '\n\n'); // Normalize line breaks
      break;
    case ContentPlatform.TIKTOK:
      formattedContent = formattedContent
        .replace(/(#\w+)/g, '<span class="text-primary-500">$1</span>')
        .replace(/(@\w+)/g, '<span class="text-primary-500">$1</span>');
      break;
    case ContentPlatform.EMAIL:
      formattedContent = formattedContent
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/\S+)/g, '<a href="$1" class="text-primary-600 underline">$1</a>');
      break;
  }

  return formattedContent.length > maxChars 
    ? `${formattedContent.slice(0, maxChars)}...` 
    : formattedContent;
};

const renderPlatformPreview = (
  content: Content,
  direction: 'rtl' | 'ltr'
): JSX.Element => {
  const styles = PLATFORM_STYLES[content.platform];
  const formattedContent = formatContentForPlatform(
    content.content,
    content.platform,
    content.type
  );

  const containerClasses = clsx(
    styles.container,
    'relative overflow-hidden rounded-lg',
    direction === 'rtl' ? 'text-right' : 'text-left'
  );

  const contentClasses = clsx(
    styles.content,
    'break-words whitespace-pre-wrap'
  );

  if (content.type === ContentType.AUDIO) {
    return (
      <div className={containerClasses} role="region" aria-label="Voice content preview">
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center space-x-3">
            <button
              className="p-2 rounded-full bg-primary-600 text-white"
              aria-label="Play voice preview"
            >
              <span className="sr-only">Play</span>
              {/* Play icon */}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            </button>
            <div className="flex-1">
              <div className="h-2 bg-gray-200 rounded">
                <div className="h-2 bg-primary-600 rounded w-0" />
              </div>
            </div>
            <span className="text-sm text-gray-500">0:00</span>
          </div>
          <div className="mt-3 text-sm text-gray-600">
            {formattedContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses} role="region" aria-label="Content preview">
      <div 
        className={contentClasses}
        dangerouslySetInnerHTML={{ __html: formattedContent }}
      />
      {content.metadata && (
        <div className={styles.metadata}>
          <span className="font-medium">
            {content.metadata.language} • {content.metadata.targetAudience.join(', ')}
          </span>
        </div>
      )}
    </div>
  );
};

export const ContentPreview: React.FC<ContentPreviewProps> = ({
  content,
  className,
  showMetadata = false,
  direction = 'ltr',
  onPreviewError,
}) => {
  const [error, setError] = React.useState<PreviewError | null>(null);

  React.useEffect(() => {
    try {
      // Validate content against platform constraints
      const dimensions = PREVIEW_DIMENSIONS[content.platform];
      if (content.content.length > dimensions.maxChars) {
        const error: PreviewError = {
          code: 'CONTENT_TOO_LONG',
          message: `Content exceeds maximum length for ${content.platform}`,
          details: { maxChars: dimensions.maxChars, currentChars: content.content.length }
        };
        setError(error);
        onPreviewError?.(error);
      }
    } catch (err) {
      const error: PreviewError = {
        code: 'PREVIEW_ERROR',
        message: 'Failed to render content preview',
        details: { error: err }
      };
      setError(error);
      onPreviewError?.(error);
    }
  }, [content, onPreviewError]);

  return (
    <Card
      variant="outline"
      padding="lg"
      className={clsx('preview-container', className)}
      dir={direction}
      role="article"
    >
      {error ? (
        <div className="text-error-600 p-4 text-sm" role="alert">
          {error.message}
        </div>
      ) : (
        renderPlatformPreview(content, direction)
      )}
      {showMetadata && content.metadata && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">AI Model</dt>
              <dd className="font-medium">{content.metadata.aiModel}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Generated At</dt>
              <dd className="font-medium">
                {new Date(content.aiGeneratedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
};

export default ContentPreview;