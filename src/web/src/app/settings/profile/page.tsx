'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useFormState } from 'react-dom';
import ProfileForm from '../../../components/settings/ProfileForm';
import { useAuth } from '../../../hooks/useAuth';
import { AuthService } from '../../../services/auth.service';

// Security monitoring configuration
const SECURITY_CONFIG = {
  MFA_REQUIRED_FIELDS: ['email', 'phone'],
  MAX_VALIDATION_ATTEMPTS: 3,
  VALIDATION_TIMEOUT: 5000,
  SENSITIVE_FIELDS: ['firstName', 'lastName', 'email']
};

// Interface for profile form data
interface ProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  securityToken: string;
}

// Interface for security monitoring state
interface SecurityState {
  validationAttempts: number;
  lastValidationTime: number;
  securityEvents: Array<{
    type: string;
    timestamp: number;
    details?: any;
  }>;
}

/**
 * Enhanced profile settings page component with comprehensive security features
 */
const ProfilePage: React.FC = () => {
  // Authentication and user state
  const { user, loading, error } = useAuth();
  const authService = new AuthService();

  // Security monitoring state
  const [securityState, setSecurityState] = useState<SecurityState>({
    validationAttempts: 0,
    lastValidationTime: Date.now(),
    securityEvents: []
  });

  // Form state management
  const [formState, setFormState] = useState<{
    loading: boolean;
    error: string | null;
    requiresMFA: boolean;
  }>({
    loading: false,
    error: null,
    requiresMFA: false
  });

  /**
   * Logs security events for monitoring
   */
  const logSecurityEvent = useCallback((type: string, details?: any) => {
    setSecurityState(prev => ({
      ...prev,
      securityEvents: [
        ...prev.securityEvents,
        { type, timestamp: Date.now(), details }
      ]
    }));

    // Emit security event for monitoring
    window.dispatchEvent(new CustomEvent('profile-security-event', {
      detail: { type, timestamp: Date.now(), details }
    }));
  }, []);

  /**
   * Validates profile data with security checks
   */
  const validateProfileData = useCallback(async (data: ProfileFormData): Promise<boolean> => {
    try {
      // Check validation rate limiting
      if (securityState.validationAttempts >= SECURITY_CONFIG.MAX_VALIDATION_ATTEMPTS) {
        const cooldownTime = 60000 - (Date.now() - securityState.lastValidationTime);
        if (cooldownTime > 0) {
          throw new Error(`Too many validation attempts. Please wait ${Math.ceil(cooldownTime / 1000)} seconds.`);
        }
        // Reset attempts after cooldown
        setSecurityState(prev => ({ ...prev, validationAttempts: 0 }));
      }

      // Update validation attempts
      setSecurityState(prev => ({
        ...prev,
        validationAttempts: prev.validationAttempts + 1,
        lastValidationTime: Date.now()
      }));

      // Check for sensitive field changes that require MFA
      const requiresMFA = SECURITY_CONFIG.MFA_REQUIRED_FIELDS.some(field => 
        data[field as keyof ProfileFormData] !== user?.[field as keyof typeof user]
      );

      setFormState(prev => ({ ...prev, requiresMFA }));

      logSecurityEvent('profile_validation', {
        requiresMFA,
        fieldsChanged: Object.keys(data).filter(key => 
          data[key as keyof ProfileFormData] !== user?.[key as keyof typeof user]
        )
      });

      return true;
    } catch (error) {
      logSecurityEvent('validation_error', { error: error.message });
      toast.error(error.message);
      return false;
    }
  }, [user, securityState.validationAttempts, securityState.lastValidationTime, logSecurityEvent]);

  /**
   * Handles profile update with enhanced security
   */
  const handleProfileUpdate = useCallback(async (formData: ProfileFormData) => {
    try {
      setFormState(prev => ({ ...prev, loading: true, error: null }));

      // Validate form data
      const isValid = await validateProfileData(formData);
      if (!isValid) return;

      // Encrypt sensitive data
      const encryptedData = await Promise.all(
        SECURITY_CONFIG.SENSITIVE_FIELDS.map(async field => ({
          [field]: await authService.encryptSensitiveData(formData[field as keyof ProfileFormData])
        }))
      );

      // Verify MFA if required
      if (formState.requiresMFA) {
        const mfaVerified = await authService.verifyMFA();
        if (!mfaVerified) {
          throw new Error('MFA verification failed');
        }
        logSecurityEvent('mfa_verification_success');
      }

      // Update profile
      await authService.updateProfile({
        ...formData,
        ...Object.assign({}, ...encryptedData)
      });

      logSecurityEvent('profile_update_success');
      toast.success('Profile updated successfully');

    } catch (error) {
      logSecurityEvent('profile_update_error', { error: error.message });
      setFormState(prev => ({ ...prev, error: error.message }));
      toast.error(error.message);
    } finally {
      setFormState(prev => ({ ...prev, loading: false }));
    }
  }, [authService, formState.requiresMFA, validateProfileData, logSecurityEvent]);

  // Initialize user data
  useEffect(() => {
    if (user) {
      logSecurityEvent('profile_page_loaded', { userId: user.id });
    }
  }, [user, logSecurityEvent]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  if (error || !user) {
    return <div className="text-error-500">Error loading profile: {error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Profile Settings</h1>
      
      <ProfileForm
        initialData={{
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          title: user.title
        }}
        onSubmit={handleProfileUpdate}
        className="space-y-6"
        securityLevel="high"
        validationMode="enhanced"
      />

      {formState.error && (
        <div className="mt-4 p-4 bg-error-50 text-error-500 rounded-md">
          {formState.error}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;