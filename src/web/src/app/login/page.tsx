'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'next-i18next';
import { z } from 'zod';
import { Form } from '../../components/shared/Form';
import { Button } from '../../components/shared/Button';
import { AuthService } from '../../services/auth.service';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { ErrorBoundary } from 'react-error-boundary';
import { SecurityUtils } from '@auth/security-utils';

// Form validation schema with enhanced security requirements
const LOGIN_FORM_SCHEMA = z.object({
  email: z.string()
    .email('Invalid email format')
    .min(5, 'Email must be at least 5 characters')
    .max(100, 'Email must not exceed 100 characters'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, 
      'Password must include uppercase, lowercase, number and special character'),
  mfaCode: z.string()
    .length(6, 'MFA code must be 6 digits')
    .regex(/^\d+$/, 'MFA code must contain only numbers')
    .optional(),
  rememberMe: z.boolean()
});

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxAttempts: 5,
  windowMs: 300000, // 5 minutes
};

interface LoginFormData {
  email: string;
  password: string;
  mfaCode?: string;
  rememberMe: boolean;
}

const LoginPage: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresMFA, setRequiresMFA] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lastAttemptTime, setLastAttemptTime] = useState(0);
  const [csrfToken, setCsrfToken] = useState('');

  const authService = new AuthService();

  // Initialize CSRF token and security measures
  useEffect(() => {
    const initializeSecurity = async () => {
      try {
        const token = await SecurityUtils.generateCSRFToken();
        setCsrfToken(token);
        
        // Clear previous login attempts after window expires
        const now = Date.now();
        if (now - lastAttemptTime > RATE_LIMIT_CONFIG.windowMs) {
          setLoginAttempts(0);
          setLastAttemptTime(now);
        }
      } catch (error) {
        console.error('Security initialization failed:', error);
        setError('Security initialization failed. Please try again.');
      }
    };

    initializeSecurity();
  }, [lastAttemptTime]);

  const handleLogin = async (formData: LoginFormData) => {
    try {
      setError(null);
      setIsLoading(true);

      // Check rate limiting
      if (loginAttempts >= RATE_LIMIT_CONFIG.maxAttempts) {
        const timeRemaining = RATE_LIMIT_CONFIG.windowMs - (Date.now() - lastAttemptTime);
        throw new Error(`Too many login attempts. Please try again in ${Math.ceil(timeRemaining / 60000)} minutes.`);
      }

      // Validate CSRF token
      if (!SecurityUtils.validateCSRFToken(csrfToken)) {
        throw new Error('Security validation failed. Please refresh the page.');
      }

      // Get browser fingerprint for security
      const fingerprint = await SecurityUtils.getBrowserFingerprint();

      // Attempt login with enhanced security
      const response = await authService.login({
        email: formData.email,
        password: formData.password,
        mfaCode: formData.mfaCode,
        rememberMe: formData.rememberMe,
        fingerprint,
        csrfToken
      });

      if (response.requiresMFA && !formData.mfaCode) {
        setRequiresMFA(true);
        setIsLoading(false);
        return;
      }

      // Reset login attempts on success
      setLoginAttempts(0);
      router.push('/dashboard');

    } catch (error) {
      setLoginAttempts(prev => prev + 1);
      setLastAttemptTime(Date.now());
      setError(error instanceof Error ? error.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ErrorBoundary fallback={<div>Something went wrong. Please refresh the page.</div>}>
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('login.title')}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t('login.subtitle')}
            </p>
          </div>

          <Form
            onSubmit={handleLogin}
            validationSchema={LOGIN_FORM_SCHEMA}
            initialValues={{
              email: '',
              password: '',
              mfaCode: '',
              rememberMe: false
            }}
            className="mt-8 space-y-6"
          >
            {error && (
              <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/50">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <Form.Input
                name="email"
                type="email"
                label={t('login.email')}
                autoComplete="email"
                required
                aria-label={t('login.email')}
              />

              <Form.Input
                name="password"
                type="password"
                label={t('login.password')}
                autoComplete="current-password"
                required
                aria-label={t('login.password')}
              />

              {requiresMFA && (
                <Form.Input
                  name="mfaCode"
                  type="text"
                  label={t('login.mfaCode')}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  aria-label={t('login.mfaCode')}
                />
              )}

              <Form.Checkbox
                name="rememberMe"
                label={t('login.rememberMe')}
                aria-label={t('login.rememberMe')}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
              isDisabled={loginAttempts >= RATE_LIMIT_CONFIG.maxAttempts}
              aria-label={t('login.submit')}
            >
              {t('login.submit')}
            </Button>
          </Form>

          <div className="mt-4 text-center">
            <a
              href="/forgot-password"
              className="text-sm text-primary hover:text-primary-dark"
              style={{ color: DESIGN_SYSTEM.COLORS.primary }}
            >
              {t('login.forgotPassword')}
            </a>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default LoginPage;