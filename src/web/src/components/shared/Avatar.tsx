import React, { useState, useCallback, useMemo } from 'react';
import { classNames } from '../../lib/utils';

// Type definitions with strict type safety
type AvatarSize = 'sm' | 'md' | 'lg';
type AvatarVariant = 'circle' | 'rounded';

interface AvatarProps {
  src?: string;
  alt: string;
  name: string;
  size?: AvatarSize;
  variant?: AvatarVariant;
  className?: string;
  loading?: boolean;
}

// Constants following design system specifications
const AVATAR_SIZES = {
  SMALL: 'sm',
  MEDIUM: 'md',
  LARGE: 'lg',
} as const;

const AVATAR_VARIANTS = {
  CIRCLE: 'circle',
  ROUNDED: 'rounded',
} as const;

const SIZE_CLASSES = {
  [AVATAR_SIZES.SMALL]: 'w-8 h-8 text-sm',
  [AVATAR_SIZES.MEDIUM]: 'w-12 h-12 text-base',
  [AVATAR_SIZES.LARGE]: 'w-16 h-16 text-lg',
} as const;

const VARIANT_CLASSES = {
  [AVATAR_VARIANTS.CIRCLE]: 'rounded-full',
  [AVATAR_VARIANTS.ROUNDED]: 'rounded-lg',
} as const;

/**
 * Extracts initials from a user's name with enhanced validation
 * @param name - User's full name
 * @returns Formatted initials or fallback symbol
 */
const getInitials = (name: string): string => {
  if (!name?.trim()) return '?';

  const nameParts = name.trim().split(/[\s-]+/);
  const firstInitial = nameParts[0]?.[0] || '';
  const lastInitial = nameParts[nameParts.length - 1]?.[0] || '';

  // Handle special characters and diacritics
  const normalizedInitials = (firstInitial + lastInitial)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  return normalizedInitials || '?';
};

/**
 * Enhanced Avatar component with loading states, error handling, and accessibility
 */
const Avatar: React.FC<AvatarProps> = React.memo(({
  src,
  alt,
  name,
  size = AVATAR_SIZES.MEDIUM,
  variant = AVATAR_VARIANTS.CIRCLE,
  className = '',
  loading = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const initials = useMemo(() => getInitials(name), [name]);

  // Memoized class generation for performance
  const avatarClasses = useMemo(() => {
    return classNames(
      // Base classes
      'inline-flex items-center justify-center bg-gray-100 border-2 border-white',
      // Size classes
      SIZE_CLASSES[size],
      // Variant classes
      VARIANT_CLASSES[variant],
      // Loading state
      loading && 'animate-pulse bg-gray-200',
      // Custom classes
      className
    );
  }, [size, variant, loading, className]);

  // Memoized placeholder classes
  const placeholderClasses = useMemo(() => {
    return classNames(
      'font-medium text-gray-600',
      size === AVATAR_SIZES.SMALL && 'text-xs',
      size === AVATAR_SIZES.MEDIUM && 'text-sm',
      size === AVATAR_SIZES.LARGE && 'text-base'
    );
  }, [size]);

  // Enhanced error handling with accessibility updates
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.preventDefault();
    setImageError(true);
    console.error(`Avatar image failed to load for user: ${name}`);
  }, [name]);

  // Render image if available and no error
  if (src && !imageError && !loading) {
    return (
      <img
        src={src}
        alt={alt}
        className={avatarClasses}
        onError={handleImageError}
        loading="lazy"
        decoding="async"
        role="img"
        aria-label={alt}
      />
    );
  }

  // Render placeholder with initials
  return (
    <div
      className={avatarClasses}
      role="img"
      aria-label={alt}
      title={name}
      data-testid="avatar-placeholder"
    >
      <span className={placeholderClasses} aria-hidden="true">
        {initials}
      </span>
    </div>
  );
});

// Display name for debugging
Avatar.displayName = 'Avatar';

export default Avatar;