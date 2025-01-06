import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ThemeProvider } from 'styled-components';
import { expect, describe, it, jest, beforeEach, afterEach } from '@jest/globals';
import { Alert, AlertProps } from '../../src/components/shared/Alert';
import Button from '../../src/components/shared/Button';
import { classNames } from '../../src/lib/utils';
import { DESIGN_SYSTEM } from '../../src/lib/constants';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock intersection observer for animation testing
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null
});
window.IntersectionObserver = mockIntersectionObserver;

// Helper function to render components with theme provider
const renderWithTheme = (children: React.ReactNode) => {
  return render(
    <ThemeProvider theme={DESIGN_SYSTEM}>
      {children}
    </ThemeProvider>
  );
};

describe('Alert Component', () => {
  const onDismiss = jest.fn();

  beforeEach(() => {
    onDismiss.mockClear();
  });

  it('renders with correct design system styles', () => {
    const { container } = renderWithTheme(
      <Alert title="Test Alert" type="info">
        Alert content
      </Alert>
    );

    const alert = container.firstChild as HTMLElement;
    expect(alert).toHaveClass('bg-blue-50', 'text-blue-800');
    expect(alert).toHaveStyle({
      padding: '1rem', // 16px
      borderRadius: '0.5rem' // 8px
    });
  });

  it('implements proper ARIA attributes', () => {
    renderWithTheme(
      <Alert title="Test Alert" type="error">
        Alert content
      </Alert>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-labelledby');
    expect(alert).toHaveAttribute('aria-describedby');
  });

  it('handles keyboard navigation and focus management', async () => {
    renderWithTheme(
      <Alert title="Test Alert" dismissible onDismiss={onDismiss}>
        Alert content
      </Alert>
    );

    const dismissButton = screen.getByRole('button', { name: /dismiss alert/i });
    
    // Test keyboard navigation
    await userEvent.tab();
    expect(dismissButton).toHaveFocus();

    // Test keyboard dismissal
    await userEvent.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('displays different alert types with correct styling', () => {
    const types: AlertProps['type'][] = ['info', 'success', 'warning', 'error'];
    
    types.forEach(type => {
      const { container } = renderWithTheme(
        <Alert title="Test Alert" type={type}>
          Alert content
        </Alert>
      );

      const alert = container.firstChild as HTMLElement;
      const expectedClass = `bg-${type === 'info' ? 'blue' : type}-50`;
      expect(alert).toHaveClass(expectedClass);
    });
  });

  it('handles auto-dismiss functionality', async () => {
    jest.useFakeTimers();
    
    renderWithTheme(
      <Alert 
        title="Auto Dismiss Alert" 
        dismissible 
        onDismiss={onDismiss}
        autoDismissTimeout={2000}
      >
        Alert content
      </Alert>
    );

    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    jest.useRealTimers();
  });

  it('passes accessibility audit', async () => {
    const { container } = renderWithTheme(
      <Alert title="Accessibility Test Alert" type="info">
        Alert content
      </Alert>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Button Component', () => {
  const onClick = jest.fn();

  beforeEach(() => {
    onClick.mockClear();
  });

  it('implements design system variants correctly', () => {
    const variants = ['primary', 'secondary', 'outline', 'ghost'];
    
    variants.forEach(variant => {
      const { container } = renderWithTheme(
        <Button variant={variant as any}>
          Button Text
        </Button>
      );

      const button = container.firstChild as HTMLElement;
      expect(button).toHaveClass(
        classNames(
          'inline-flex',
          'items-center',
          'justify-center',
          'rounded-md',
          'font-medium'
        )
      );
    });
  });

  it('handles loading state with proper ARIA attributes', () => {
    renderWithTheme(
      <Button isLoading onClick={onClick}>
        Loading Button
      </Button>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(screen.getByText('Loading Button')).toHaveClass('opacity-90');
  });

  it('maintains accessibility during disabled state', async () => {
    renderWithTheme(
      <Button isDisabled onClick={onClick}>
        Disabled Button
      </Button>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('handles keyboard interactions properly', async () => {
    renderWithTheme(
      <Button onClick={onClick}>
        Interactive Button
      </Button>
    );

    const button = screen.getByRole('button');
    
    // Test keyboard interaction
    await userEvent.tab();
    expect(button).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('implements proper touch targets for mobile', () => {
    const { container } = renderWithTheme(
      <Button size="lg">
        Mobile Button
      </Button>
    );

    const button = container.firstChild as HTMLElement;
    expect(button).toHaveStyle({
      minHeight: '44px', // Minimum touch target size
      padding: '0.75rem 1.5rem' // 12px 24px
    });
  });

  it('handles icon placement and spacing correctly', () => {
    const startIcon = <span data-testid="start-icon">Start</span>;
    const endIcon = <span data-testid="end-icon">End</span>;

    renderWithTheme(
      <Button startIcon={startIcon} endIcon={endIcon}>
        Icon Button
      </Button>
    );

    expect(screen.getByTestId('start-icon')).toHaveClass('shrink-0');
    expect(screen.getByTestId('end-icon')).toHaveClass('shrink-0');
  });

  it('passes accessibility audit', async () => {
    const { container } = renderWithTheme(
      <Button onClick={onClick}>
        Accessibility Test Button
      </Button>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});