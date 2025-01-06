import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react'; // v18.0+
import clsx from 'clsx'; // v2.0+
import { Menu, Transition } from '@headlessui/react'; // v1.7+
import { DESIGN_SYSTEM } from '../../lib/constants';
import Button from './Button';

/**
 * Interface for dropdown option items with support for nesting and icons
 */
interface DropdownOption {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  options?: DropdownOption[];
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Props interface for the Dropdown component
 */
interface DropdownProps {
  options: DropdownOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  width?: 'sm' | 'md' | 'lg' | 'full';
  placement?: 'top' | 'bottom' | 'left' | 'right';
  loading?: boolean;
  error?: string;
  onSearch?: (query: string) => void;
  virtualized?: boolean;
  maxHeight?: number;
  renderOption?: (option: DropdownOption) => React.ReactNode;
}

/**
 * Custom hook for managing dropdown state and keyboard navigation
 */
const useDropdownState = (
  options: DropdownOption[],
  value: string | number,
  onChange: (value: string | number) => void,
  searchable?: boolean
) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Filter options based on search query
  const filteredOptions = searchable && searchQuery
    ? options.filter(option => 
        option.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : options;

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => 
          prev > 0 ? prev - 1 : filteredOptions.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) {
          onChange(filteredOptions[activeIndex].value);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  }, [isOpen, filteredOptions, activeIndex, onChange]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    isOpen,
    setIsOpen,
    searchQuery,
    setSearchQuery,
    activeIndex,
    setActiveIndex,
    filteredOptions,
    searchInputRef,
    optionsRef
  };
};

/**
 * Dropdown component with comprehensive features and accessibility
 */
export const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  searchable = false,
  className = '',
  width = 'md',
  placement = 'bottom',
  loading = false,
  error,
  onSearch,
  virtualized = false,
  maxHeight = 300,
  renderOption
}, ref) => {
  const {
    isOpen,
    setIsOpen,
    searchQuery,
    setSearchQuery,
    activeIndex,
    setActiveIndex,
    filteredOptions,
    searchInputRef,
    optionsRef
  } = useDropdownState(options, value, onChange, searchable);

  // Get selected option label
  const selectedOption = options.find(opt => opt.value === value);
  const selectedLabel = selectedOption?.label || placeholder;

  // Width classes based on size prop
  const widthClasses = {
    sm: 'w-48',
    md: 'w-64',
    lg: 'w-96',
    full: 'w-full'
  };

  // Placement classes
  const placementClasses = {
    top: 'bottom-full mb-1',
    bottom: 'top-full mt-1',
    left: 'right-full mr-1',
    right: 'left-full ml-1'
  };

  return (
    <div 
      ref={ref}
      className={clsx(
        'relative inline-block text-left font-inter',
        widthClasses[width],
        className
      )}
    >
      <Menu as="div" className="relative">
        {({ open }) => (
          <>
            <Menu.Button
              as={Button}
              variant="outline"
              fullWidth
              disabled={disabled}
              isLoading={loading}
              className={clsx(
                'justify-between',
                error && 'border-error-500',
                open && 'ring-2 ring-primary-500'
              )}
              aria-expanded={open}
              aria-invalid={!!error}
              aria-describedby={error ? 'dropdown-error' : undefined}
            >
              <span className="truncate">{selectedLabel}</span>
              <svg
                className={clsx(
                  'w-5 h-5 ml-2 transition-transform',
                  open && 'transform rotate-180'
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </Menu.Button>

            <Transition
              show={isOpen}
              as={React.Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items
                static
                className={clsx(
                  'absolute z-10 w-full rounded-md bg-white shadow-lg',
                  'ring-1 ring-black ring-opacity-5 focus:outline-none',
                  placementClasses[placement]
                )}
                style={{
                  maxHeight: `${maxHeight}px`,
                  overflowY: 'auto',
                  boxShadow: DESIGN_SYSTEM.SHADOWS.md
                }}
              >
                {searchable && (
                  <div className="sticky top-0 p-2 bg-white border-b">
                    <input
                      ref={searchInputRef}
                      type="text"
                      className={clsx(
                        'w-full px-3 py-2 text-sm rounded-md',
                        'border border-gray-300 focus:outline-none',
                        'focus:ring-2 focus:ring-primary-500'
                      )}
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        onSearch?.(e.target.value);
                      }}
                      aria-label="Search options"
                    />
                  </div>
                )}

                <div
                  ref={optionsRef}
                  className="py-1"
                  role="listbox"
                  aria-orientation="vertical"
                >
                  {filteredOptions.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      No options available
                    </div>
                  ) : (
                    filteredOptions.map((option, index) => (
                      <Menu.Item key={option.value}>
                        {({ active }) => (
                          <button
                            type="button"
                            className={clsx(
                              'w-full text-left px-4 py-2 text-sm',
                              'flex items-center space-x-2',
                              active && 'bg-primary-50 text-primary-900',
                              option.disabled && 'opacity-50 cursor-not-allowed',
                              activeIndex === index && 'bg-primary-50'
                            )}
                            onClick={() => {
                              if (!option.disabled) {
                                onChange(option.value);
                                setIsOpen(false);
                              }
                            }}
                            disabled={option.disabled}
                            role="option"
                            aria-selected={value === option.value}
                          >
                            {option.icon && (
                              <span className="flex-shrink-0">{option.icon}</span>
                            )}
                            <span className="flex-1">
                              {renderOption ? renderOption(option) : option.label}
                            </span>
                            {value === option.value && (
                              <svg
                                className="w-5 h-5 text-primary-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                      </Menu.Item>
                    ))
                  )}
                </div>
              </Menu.Items>
            </Transition>
          </>
        )}
      </Menu>

      {error && (
        <p
          id="dropdown-error"
          className="mt-1 text-sm text-error-500"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
});

Dropdown.displayName = 'Dropdown';

export default Dropdown;