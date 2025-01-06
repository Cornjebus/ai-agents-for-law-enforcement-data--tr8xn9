'use client';

import { Inter } from 'next/font/google';
import { ErrorBoundary } from 'react-error-boundary';
import { Metadata } from 'next';
import Providers from './providers';
import Navigation from '../components/shared/Navigation';
import '../styles/globals.css';

// Initialize Inter font with subset optimization
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Root layout props interface
interface RootLayoutProps {
  children: React.ReactNode;
  performanceMonitor?: boolean;
}

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div role="alert" className="p-6 bg-white rounded-lg shadow-lg">
    <h2 className="text-2xl font-bold text-error mb-4">Something went wrong:</h2>
    <pre className="bg-gray-100 p-4 rounded mb-4 overflow-auto">{error.message}</pre>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark focus:ring-2 focus:ring-primary focus:outline-none"
    >
      Try again
    </button>
  </div>
);

// Metadata generation for enhanced SEO
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Autonomous Revenue Generation Platform',
    description: 'AI-driven platform for automated revenue generation and business growth',
    keywords: ['revenue generation', 'AI automation', 'business growth', 'sales automation'],
    authors: [{ name: 'ARGP Team' }],
    viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
    themeColor: '#2563EB',
    manifest: '/manifest.json',
    icons: {
      icon: '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
    openGraph: {
      type: 'website',
      title: 'Autonomous Revenue Generation Platform',
      description: 'AI-driven platform for automated revenue generation',
      siteName: 'ARGP',
      url: process.env.NEXT_PUBLIC_APP_URL,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Autonomous Revenue Generation Platform',
      description: 'AI-driven platform for automated revenue generation',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
  };
}

// Root layout component with enhanced error handling and performance monitoring
export default function RootLayout({ children, performanceMonitor = true }: RootLayoutProps) {
  // Error handling for error boundary
  const handleError = (error: Error, info: { componentStack: string }) => {
    // Log error to monitoring service
    console.error('Layout Error:', error);
    console.error('Component Stack:', info.componentStack);

    // Emit error event for monitoring
    window.dispatchEvent(new CustomEvent('layout-error', {
      detail: {
        error: error.message,
        componentStack: info.componentStack,
        timestamp: Date.now()
      }
    }));
  };

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <ErrorBoundary
          FallbackComponent={ErrorFallback}
          onError={handleError}
          onReset={() => {
            // Reset application state on error recovery
            window.location.reload();
          }}
        >
          <Providers performanceMonitor={performanceMonitor}>
            {/* Skip to main content link for accessibility */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-white p-4 rounded shadow"
            >
              Skip to main content
            </a>

            {/* Main application structure */}
            <div className="min-h-screen bg-gray-50">
              <Navigation />
              
              <main
                id="main-content"
                className="pt-16 pb-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
                role="main"
                aria-label="Main content"
              >
                {children}
              </main>

              {/* Accessibility announcer for dynamic content updates */}
              <div
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                role="status"
                id="announcer"
              />
            </div>
          </Providers>
        </ErrorBoundary>

        {/* Performance monitoring script */}
        {performanceMonitor && process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.addEventListener('load', function() {
                  const observer = new PerformanceObserver((list) => {
                    list.getEntries().forEach((entry) => {
                      window.dispatchEvent(new CustomEvent('performance-metric', {
                        detail: {
                          name: entry.name,
                          value: entry.value,
                          timestamp: Date.now()
                        }
                      }));
                    });
                  });
                  observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] });
                });
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}