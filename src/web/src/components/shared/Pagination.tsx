import React, { useMemo } from 'react';
import { classNames } from '../../lib/utils';
import Button from './Button';
import { DESIGN_SYSTEM } from '../../lib/constants';

/**
 * Props interface for the Pagination component
 */
interface PaginationProps {
  /** Current active page number */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback function when page changes */
  onPageChange: (page: number) => void;
  /** Number of items per page */
  pageSize?: number;
  /** Number of sibling pages to show on each side */
  siblingCount?: number;
  /** Optional class name for styling */
  className?: string;
  /** ARIA label for pagination navigation */
  ariaLabel?: string;
  /** Show first and last page buttons */
  showFirstLast?: boolean;
  /** Enable responsive design */
  responsive?: boolean;
  /** Support for RTL languages */
  rtl?: boolean;
}

/**
 * Custom hook to generate pagination range with memoization
 */
const usePagination = (
  currentPage: number,
  totalPages: number,
  siblingCount: number,
  showFirstLast: boolean
): Array<number | 'dots'> => {
  return useMemo(() => {
    const range = (start: number, end: number) => 
      Array.from({ length: end - start + 1 }, (_, i) => start + i);

    const totalNumbers = siblingCount * 2 + 3;
    const totalBlocks = totalNumbers + 2;

    if (totalPages <= totalBlocks) {
      return range(1, totalPages);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      const leftItemCount = 3 + 2 * siblingCount;
      const leftRange = range(1, leftItemCount);
      return [...leftRange, 'dots', totalPages];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = 3 + 2 * siblingCount;
      const rightRange = range(totalPages - rightItemCount + 1, totalPages);
      return [1, 'dots', ...rightRange];
    }

    if (shouldShowLeftDots && shouldShowRightDots) {
      const middleRange = range(leftSiblingIndex, rightSiblingIndex);
      return [1, 'dots', ...middleRange, 'dots', totalPages];
    }

    return range(1, totalPages);
  }, [currentPage, totalPages, siblingCount]);
};

/**
 * Pagination component for navigating through multi-page content
 */
const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  pageSize = 10,
  siblingCount = 1,
  className = '',
  ariaLabel = 'Pagination navigation',
  showFirstLast = true,
  responsive = true,
  rtl = false,
}) => {
  const paginationRange = usePagination(currentPage, totalPages, siblingCount, showFirstLast);

  // Don't render if there's only one page
  if (totalPages <= 1) return null;

  const onNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const onPrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const baseButtonStyles = classNames(
    'inline-flex items-center justify-center rounded-md transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
    responsive ? 'w-8 h-8 text-sm md:w-10 md:h-10 md:text-base' : 'w-10 h-10 text-base'
  );

  const activeButtonStyles = classNames(
    'bg-primary-600 text-white hover:bg-primary-700',
    'border border-transparent'
  );

  const inactiveButtonStyles = classNames(
    'bg-white text-gray-700 hover:bg-gray-50',
    'border border-gray-300'
  );

  const disabledButtonStyles = classNames(
    'opacity-50 cursor-not-allowed pointer-events-none',
    'bg-gray-100 text-gray-400 border border-gray-300'
  );

  return (
    <nav
      aria-label={ariaLabel}
      className={classNames(
        'flex items-center justify-center',
        rtl ? 'space-x-reverse' : 'space-x-2',
        className
      )}
      dir={rtl ? 'rtl' : 'ltr'}
    >
      {showFirstLast && (
        <Button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={classNames(
            baseButtonStyles,
            currentPage === 1 ? disabledButtonStyles : inactiveButtonStyles
          )}
          aria-label="Go to first page"
        >
          «
        </Button>
      )}

      <Button
        onClick={onPrevious}
        disabled={currentPage === 1}
        className={classNames(
          baseButtonStyles,
          currentPage === 1 ? disabledButtonStyles : inactiveButtonStyles
        )}
        aria-label="Go to previous page"
      >
        ‹
      </Button>

      {paginationRange.map((pageNumber, index) => {
        if (pageNumber === 'dots') {
          return (
            <span
              key={`dots-${index}`}
              className="px-2 text-gray-500 select-none"
              aria-hidden="true"
            >
              …
            </span>
          );
        }

        return (
          <Button
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
            className={classNames(
              baseButtonStyles,
              pageNumber === currentPage ? activeButtonStyles : inactiveButtonStyles
            )}
            aria-label={`Go to page ${pageNumber}`}
            aria-current={pageNumber === currentPage ? 'page' : undefined}
          >
            {pageNumber}
          </Button>
        );
      })}

      <Button
        onClick={onNext}
        disabled={currentPage === totalPages}
        className={classNames(
          baseButtonStyles,
          currentPage === totalPages ? disabledButtonStyles : inactiveButtonStyles
        )}
        aria-label="Go to next page"
      >
        ›
      </Button>

      {showFirstLast && (
        <Button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={classNames(
            baseButtonStyles,
            currentPage === totalPages ? disabledButtonStyles : inactiveButtonStyles
          )}
          aria-label="Go to last page"
        >
          »
        </Button>
      )}
    </nav>
  );
};

export default Pagination;