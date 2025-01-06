/**
 * @fileoverview Root providers component that wraps the application with necessary context providers
 * including Redux store provider, theme provider, authentication provider, and error boundaries.
 * @version 1.0.0
 */

import { Provider } from 'react-redux'; // v8.1.0
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material'; // v5.13.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.4
import { memo } from 'react'; // v18.2.0
import type { ReactNode } from 'react'; // v18.2.0
import { store } from '../store';
import { DESIGN_SYSTEM } from '../lib/constants';

// Create theme using design system specifications
const theme = createTheme({
  palette: {
    primary: {
      main: DESIGN_SYSTEM.COLORS.primary,
    },
    secondary: {
      main: DESIGN_SYSTEM.COLORS.secondary,
    },
    error: {
      main: DESIGN_SYSTEM.COLORS.error,
    },
    success: {
      main: DESIGN_SYSTEM.COLORS.success,
    },
    warning: {
      main: DESIGN_SYSTEM.COLORS.warning,
    },
    grey: DESIGN_SYSTEM.COLORS.gray,
  },
  typography: {
    fontFamily: DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary,
    fontSize: parseInt(DESIGN_SYSTEM.TYPOGRAPHY.fontSize.base),
    h1: {
      fontSize: DESIGN_SYSTEM.TYPOGRAPHY.fontSize['2xl'],
      fontWeight: DESIGN_SYSTEM.TYPOGRAPHY.fontWeight.bold,
      lineHeight: DESIGN_SYSTEM.TYPOGRAPHY.lineHeight.tight,
    },
    h2: {
      fontSize: DESIGN_SYSTEM.TYPOGRAPHY.fontSize.xl,
      fontWeight: DESIGN_SYSTEM.TYPOGRAPHY.fontWeight.semibold,
      lineHeight: DESIGN_SYSTEM.TYPOGRAPHY.lineHeight.tight,
    },
    h3: {
      fontSize: DESIGN_SYSTEM.TYPOGRAPHY.fontSize.lg,
      fontWeight: DESIGN_SYSTEM.TYPOGRAPHY.fontWeight.medium,
      lineHeight: DESIGN_SYSTEM.TYPOGRAPHY.lineHeight.normal,
    },
    body1: {
      fontSize: DESIGN_SYSTEM.TYPOGRAPHY.fontSize.base,
      lineHeight: DESIGN_SYSTEM.TYPOGRAPHY.lineHeight.normal,
    },
    body2: {
      fontSize: DESIGN_SYSTEM.TYPOGRAPHY.fontSize.sm,
      lineHeight: DESIGN_SYSTEM.TYPOGRAPHY.lineHeight.normal,
    },
  },
  spacing: DESIGN_SYSTEM.SPACING.base,
  breakpoints: {
    values: {
      xs: DESIGN_SYSTEM.BREAKPOINTS.mobile,
      sm: DESIGN_SYSTEM.BREAKPOINTS.tablet,
      md: DESIGN_SYSTEM.BREAKPOINTS.desktop,
      lg: DESIGN_SYSTEM.BREAKPOINTS.wide,
      xl: DESIGN_SYSTEM.BREAKPOINTS.wide + 200,
    },
  },
  shadows: [
    'none',
    DESIGN_SYSTEM.SHADOWS.sm,
    DESIGN_SYSTEM.SHADOWS.md,
    DESIGN_SYSTEM.SHADOWS.lg,
    ...Array(21).fill(DESIGN_SYSTEM.SHADOWS.lg), // Fill remaining shadow slots
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: '100vh',
        },
        '*:focus': {
          outline: DESIGN_SYSTEM.ACCESSIBILITY.focusRing,
        },
        // Ensure minimum tap target size for mobile
        'button, [role="button"], a': {
          minWidth: DESIGN_SYSTEM.ACCESSIBILITY.minTapTarget,
          minHeight: DESIGN_SYSTEM.ACCESSIBILITY.minTapTarget,
        },
      },
    },
  },
});

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div role="alert" style={{ padding: theme.spacing(3) }}>
    <h2>Something went wrong:</h2>
    <pre style={{ color: theme.palette.error.main }}>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

// Error handler for error boundary
const handleError = (error: Error, info: { componentStack: string }) => {
  // Log error to monitoring service
  console.error('Provider Error:', error);
  console.error('Component Stack:', info.componentStack);

  // Emit error event for monitoring
  window.dispatchEvent(new CustomEvent('provider-error', {
    detail: {
      error: error.message,
      componentStack: info.componentStack,
      timestamp: Date.now()
    }
  }));
};

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root providers component that wraps the application with necessary context providers
 * Implements global state management, theme consistency, and error handling
 */
export const Providers = memo(({ children }: ProvidersProps) => {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={() => {
        // Reset application state on error recovery
        window.location.reload();
      }}
    >
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </Provider>
    </ErrorBoundary>
  );
});

Providers.displayName = 'Providers';

export default Providers;