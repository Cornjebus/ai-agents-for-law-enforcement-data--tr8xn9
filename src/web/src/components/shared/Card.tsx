import React from 'react';
import clsx from 'clsx';
import { DESIGN_SYSTEM } from '../../lib/constants';

// Props interface for the Card component
interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'interactive' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  role?: string;
  dir?: 'ltr' | 'rtl';
}

// Memoized function to generate card classes
const getCardClasses = React.useMemo(
  () => (variant: CardProps['variant'], padding: CardProps['padding'], className?: string, dir?: CardProps['dir']) => {
    const baseClasses = 'rounded-lg bg-white transition-all duration-200';
    
    const variantClasses = {
      default: 'shadow-sm',
      interactive: [
        'shadow-sm hover:shadow-md cursor-pointer',
        'active:shadow-sm focus:outline-none',
        `focus:ring-2 focus:ring-[${DESIGN_SYSTEM.COLORS.primary}]`,
        'active:translate-y-px'
      ].join(' '),
      outline: 'border border-gray-200 hover:border-gray-300'
    };

    const paddingClasses = {
      none: 'p-0',
      sm: dir === 'rtl' ? 'pl-3 pr-3 py-3' : 'px-3 py-3',
      md: dir === 'rtl' ? 'pl-4 pr-4 py-4' : 'px-4 py-4',
      lg: dir === 'rtl' ? 'pl-6 pr-6 py-6' : 'px-6 py-6'
    };

    return clsx(
      baseClasses,
      variant && variantClasses[variant],
      padding && paddingClasses[padding],
      className
    );
  },
  []
);

/**
 * Card component that implements the design system's card styles
 * Supports different variants, padding sizes, and hover states
 * Ensures WCAG 2.1 AA compliance and RTL layout support
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      variant = 'default',
      padding = 'md',
      className,
      onClick,
      role = 'article',
      dir = 'ltr',
      ...props
    },
    ref
  ) => {
    // Memoize the combined classes for performance
    const cardClasses = React.useMemo(
      () => getCardClasses(variant, padding, className, dir),
      [variant, padding, className, dir]
    );

    // Handle keyboard interaction for interactive variants
    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (variant === 'interactive' && onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick(event as unknown as React.MouseEvent<HTMLDivElement>);
        }
      },
      [variant, onClick]
    );

    return (
      <div
        ref={ref}
        className={cardClasses}
        onClick={variant === 'interactive' ? onClick : undefined}
        onKeyDown={handleKeyDown}
        role={role}
        dir={dir}
        tabIndex={variant === 'interactive' ? 0 : undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

// Display name for debugging and dev tools
Card.displayName = 'Card';

// Default export
export default Card;