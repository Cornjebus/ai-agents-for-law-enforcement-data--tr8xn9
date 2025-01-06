import React, { useState, useCallback, useRef, useEffect } from 'react';
import { classNames } from '../../lib/utils';

// Version comments for external dependencies
// react: ^18.0.0

interface TabsProps {
  tabs: Array<{
    id: string;
    label: string;
    content: React.ReactNode;
    isDisabled?: boolean;
  }>;
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  onTabFocus?: (tabId: string) => void;
  variant?: 'primary' | 'secondary';
  className?: string;
  transitionDuration?: number;
  isVertical?: boolean;
}

interface TabPanelProps {
  id: string;
  active: boolean;
  children: React.ReactNode;
  transitionDuration: number;
}

const TabPanel = React.memo(({ id, active, children, transitionDuration }: TabPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={panelRef}
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!active}
      className={classNames(
        'mt-4',
        'transition-opacity duration-200',
        active ? 'opacity-100' : 'opacity-0'
      )}
      style={{ transitionDuration: `${transitionDuration}ms` }}
    >
      {children}
    </div>
  );
});

TabPanel.displayName = 'TabPanel';

export const Tabs = React.memo(({
  tabs,
  defaultTab,
  onChange,
  onTabFocus,
  variant = 'primary',
  className,
  transitionDuration = 200,
  isVertical = false
}: TabsProps) => {
  // Find first enabled tab for default selection
  const firstEnabledTab = tabs.find(tab => !tab.isDisabled)?.id;
  const [activeTab, setActiveTab] = useState<string>(defaultTab || firstEnabledTab || tabs[0].id);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Handle tab selection
  const handleTabClick = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab && !tab.isDisabled) {
      setActiveTab(tabId);
      onChange?.(tabId);
    }
  }, [tabs, onChange]);

  // Focus management
  const handleTabFocus = useCallback((tabId: string) => {
    onTabFocus?.(tabId);
  }, [onTabFocus]);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const enabledTabs = tabs.filter(tab => !tab.isDisabled);
    const currentIndex = enabledTabs.findIndex(tab => tab.id === activeTab);
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        nextIndex = currentIndex + 1;
        if (nextIndex >= enabledTabs.length) nextIndex = 0;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) nextIndex = enabledTabs.length - 1;
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = enabledTabs.length - 1;
        break;
      default:
        return;
    }

    const nextTab = enabledTabs[nextIndex];
    if (nextTab) {
      handleTabClick(nextTab.id);
      tabRefs.current.get(nextTab.id)?.focus();
    }
  }, [activeTab, tabs, handleTabClick]);

  // Register tab refs for focus management
  useEffect(() => {
    tabs.forEach(tab => {
      if (!tabRefs.current.has(tab.id)) {
        const element = document.getElementById(`tab-${tab.id}`) as HTMLButtonElement;
        if (element) {
          tabRefs.current.set(tab.id, element);
        }
      }
    });

    return () => {
      tabRefs.current.clear();
    };
  }, [tabs]);

  return (
    <div className={classNames('w-full', className)}>
      <div
        ref={tabListRef}
        role="tablist"
        aria-orientation={isVertical ? 'vertical' : 'horizontal'}
        className={classNames(
          isVertical ? 'flex flex-col border-r border-gray-200' : 'flex border-b border-gray-200',
          'relative'
        )}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            aria-disabled={tab.isDisabled}
            tabIndex={activeTab === tab.id ? 0 : -1}
            disabled={tab.isDisabled}
            onClick={() => handleTabClick(tab.id)}
            onFocus={() => handleTabFocus(tab.id)}
            className={classNames(
              'px-4 py-2 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200',
              variant === 'primary'
                ? 'text-gray-500 hover:text-gray-700 focus:ring-primary-500'
                : 'text-gray-400 hover:text-gray-600 focus:ring-gray-500',
              activeTab === tab.id && variant === 'primary'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : activeTab === tab.id && variant === 'secondary'
                ? 'text-gray-900 border-b-2 border-gray-900'
                : '',
              tab.isDisabled && 'text-gray-300 cursor-not-allowed',
              isVertical ? 'text-left' : 'text-center'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <TabPanel
          key={tab.id}
          id={tab.id}
          active={activeTab === tab.id}
          transitionDuration={transitionDuration}
        >
          {tab.content}
        </TabPanel>
      ))}
    </div>
  );
});

Tabs.displayName = 'Tabs';

export default Tabs;