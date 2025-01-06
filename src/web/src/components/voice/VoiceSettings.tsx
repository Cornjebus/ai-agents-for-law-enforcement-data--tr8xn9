/**
 * @fileoverview Voice settings management component with performance optimization
 * Provides interface for configuring voice engine preferences and quality settings
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { z } from 'zod'; // v3.22.0
import { performanceMonitor } from '@performance-monitor/react'; // v1.0.0
import { securityContext } from '@security/context'; // v2.1.0

import Form from '../shared/Form';
import { useVoice } from '../../hooks/useVoice';
import { 
  VoiceEngine, 
  VoiceQuality, 
  RoutingStrategy, 
  type IVoiceSettings 
} from '../../types/voice';

// Validation schema for voice settings
const VOICE_SETTINGS_VALIDATION_SCHEMA = z.object({
  defaultVoiceId: z.string().min(1, 'Voice ID is required'),
  preferredEngine: z.nativeEnum(VoiceEngine),
  defaultLanguage: z.string().min(2, 'Language code is required'),
  qualityPreference: z.nativeEnum(VoiceQuality),
  speedMultiplier: z.number().min(0.5).max(2),
  latencyThreshold: z.number().min(50).max(500),
  autoReconnect: z.boolean(),
  noiseReduction: z.boolean(),
  echoReduction: z.boolean(),
  geographicRouting: z.object({
    enabled: z.boolean(),
    region: z.string(),
    optimizationStrategy: z.nativeEnum(RoutingStrategy)
  })
});

// Performance thresholds based on technical specifications
const PERFORMANCE_THRESHOLDS = {
  maxLatency: 200, // ms
  targetQuality: 0.95,
  errorThreshold: 0.01,
  routingTimeout: 50 // ms
};

interface VoiceSettingsProps {
  initialSettings?: IVoiceSettings;
  onSettingsChange: (settings: IVoiceSettings) => void;
  geographicRegion: string;
  performanceThresholds?: typeof PERFORMANCE_THRESHOLDS;
}

/**
 * Voice settings management component with performance optimization
 */
const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  initialSettings,
  onSettingsChange,
  geographicRegion,
  performanceThresholds = PERFORMANCE_THRESHOLDS
}) => {
  // State management
  const [settings, setSettings] = useState<IVoiceSettings>(initialSettings || {
    defaultVoiceId: '',
    preferredEngine: VoiceEngine.NEURAL_HD,
    defaultLanguage: 'en-US',
    qualityPreference: VoiceQuality.HIGH,
    speedMultiplier: 1,
    latencyThreshold: performanceThresholds.maxLatency,
    autoReconnect: true,
    noiseReduction: true,
    echoReduction: true,
    geographicRouting: {
      enabled: true,
      region: geographicRegion,
      optimizationStrategy: RoutingStrategy.LOWEST_LATENCY
    }
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);

  // Hooks
  const { synthesizeVoice, getVoiceMetrics, optimizeGeographicRouting } = useVoice();

  /**
   * Monitors voice processing performance
   */
  const monitorPerformance = useCallback(async () => {
    const metrics = await getVoiceMetrics();
    setPerformanceMetrics(metrics);

    // Check against thresholds
    if (metrics.latency > performanceThresholds.maxLatency) {
      console.warn('Voice latency exceeds threshold:', metrics.latency);
    }

    if (metrics.quality < performanceThresholds.targetQuality) {
      console.warn('Voice quality below target:', metrics.quality);
    }

    return metrics;
  }, [getVoiceMetrics, performanceThresholds]);

  /**
   * Optimizes voice settings based on performance metrics
   */
  const optimizeSettings = useCallback(async () => {
    setIsOptimizing(true);
    try {
      const metrics = await monitorPerformance();
      
      // Optimize routing if latency is high
      if (metrics.latency > performanceThresholds.maxLatency) {
        const optimizedRouting = await optimizeGeographicRouting({
          currentRegion: settings.geographicRouting.region,
          strategy: settings.geographicRouting.optimizationStrategy
        });

        setSettings(prev => ({
          ...prev,
          geographicRouting: {
            ...prev.geographicRouting,
            region: optimizedRouting.region
          }
        }));
      }

      // Adjust quality settings if needed
      if (metrics.quality < performanceThresholds.targetQuality) {
        setSettings(prev => ({
          ...prev,
          qualityPreference: VoiceQuality.AUTO,
          preferredEngine: VoiceEngine.LOW_LATENCY
        }));
      }
    } catch (error) {
      console.error('Failed to optimize voice settings:', error);
    } finally {
      setIsOptimizing(false);
    }
  }, [settings, optimizeGeographicRouting, monitorPerformance, performanceThresholds]);

  /**
   * Handles form submission with performance monitoring
   */
  const handleSubmit = async (formData: IVoiceSettings) => {
    const startTime = performance.now();

    try {
      // Validate security context
      await securityContext.validateAccess('voice.settings.update');

      // Validate settings
      await VOICE_SETTINGS_VALIDATION_SCHEMA.parseAsync(formData);

      // Test voice synthesis with new settings
      await synthesizeVoice({
        text: 'Testing voice configuration',
        voiceId: formData.defaultVoiceId,
        engine: formData.preferredEngine,
        quality: formData.qualityPreference,
        language: formData.defaultLanguage
      });

      // Update settings
      setSettings(formData);
      onSettingsChange(formData);

      // Log performance metrics
      const duration = performance.now() - startTime;
      performanceMonitor.logMetric('voice_settings_update', duration);

    } catch (error) {
      console.error('Settings update failed:', error);
      throw error;
    }
  };

  // Initialize performance monitoring
  useEffect(() => {
    const monitor = setInterval(monitorPerformance, 30000);
    return () => clearInterval(monitor);
  }, [monitorPerformance]);

  return (
    <Form
      onSubmit={handleSubmit}
      validationSchema={VOICE_SETTINGS_VALIDATION_SCHEMA}
      initialValues={settings}
      className="voice-settings-form"
    >
      {({ values, errors, handleChange }) => (
        <div className="space-y-6">
          <div className="voice-engine-section">
            <h3 className="text-lg font-semibold mb-4">Voice Engine Configuration</h3>
            
            <div className="form-group">
              <label htmlFor="defaultVoiceId">Default Voice</label>
              <select
                id="defaultVoiceId"
                name="defaultVoiceId"
                value={values.defaultVoiceId}
                onChange={handleChange}
                className="form-select"
              >
                <option value="en-US-Neural2-D">Matthew (Neural)</option>
                <option value="en-US-Neural2-F">Joanna (Neural)</option>
                <option value="en-US-Standard-B">David (Standard)</option>
              </select>
              {errors.defaultVoiceId && (
                <span className="error">{errors.defaultVoiceId}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="preferredEngine">Preferred Engine</label>
              <select
                id="preferredEngine"
                name="preferredEngine"
                value={values.preferredEngine}
                onChange={handleChange}
                className="form-select"
              >
                {Object.values(VoiceEngine).map(engine => (
                  <option key={engine} value={engine}>{engine}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="quality-settings-section">
            <h3 className="text-lg font-semibold mb-4">Quality Settings</h3>
            
            <div className="form-group">
              <label htmlFor="qualityPreference">Quality Preference</label>
              <select
                id="qualityPreference"
                name="qualityPreference"
                value={values.qualityPreference}
                onChange={handleChange}
                className="form-select"
              >
                {Object.values(VoiceQuality).map(quality => (
                  <option key={quality} value={quality}>{quality}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="speedMultiplier">Speed Multiplier</label>
              <input
                type="range"
                id="speedMultiplier"
                name="speedMultiplier"
                min="0.5"
                max="2"
                step="0.1"
                value={values.speedMultiplier}
                onChange={handleChange}
                className="form-range"
              />
              <span className="ml-2">{values.speedMultiplier}x</span>
            </div>
          </div>

          <div className="optimization-section">
            <h3 className="text-lg font-semibold mb-4">Performance Optimization</h3>
            
            <div className="form-group">
              <label htmlFor="latencyThreshold">Latency Threshold (ms)</label>
              <input
                type="number"
                id="latencyThreshold"
                name="latencyThreshold"
                min="50"
                max="500"
                value={values.latencyThreshold}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="autoReconnect"
                  checked={values.autoReconnect}
                  onChange={handleChange}
                  className="form-checkbox"
                />
                <span className="ml-2">Enable Auto-Reconnect</span>
              </label>
            </div>

            <div className="form-group">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="noiseReduction"
                  checked={values.noiseReduction}
                  onChange={handleChange}
                  className="form-checkbox"
                />
                <span className="ml-2">Enable Noise Reduction</span>
              </label>
            </div>
          </div>

          <div className="geographic-routing-section">
            <h3 className="text-lg font-semibold mb-4">Geographic Routing</h3>
            
            <div className="form-group">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="geographicRouting.enabled"
                  checked={values.geographicRouting.enabled}
                  onChange={handleChange}
                  className="form-checkbox"
                />
                <span className="ml-2">Enable Geographic Routing</span>
              </label>
            </div>

            {values.geographicRouting.enabled && (
              <div className="form-group">
                <label htmlFor="geographicRouting.optimizationStrategy">
                  Routing Strategy
                </label>
                <select
                  id="geographicRouting.optimizationStrategy"
                  name="geographicRouting.optimizationStrategy"
                  value={values.geographicRouting.optimizationStrategy}
                  onChange={handleChange}
                  className="form-select"
                >
                  {Object.values(RoutingStrategy).map(strategy => (
                    <option key={strategy} value={strategy}>{strategy}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {performanceMetrics && (
            <div className="performance-metrics">
              <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>Latency: {performanceMetrics.latency}ms</div>
                <div>Quality Score: {performanceMetrics.quality}</div>
                <div>Error Rate: {performanceMetrics.errorRate}%</div>
                <div>Region: {performanceMetrics.region}</div>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              type="button"
              onClick={optimizeSettings}
              disabled={isOptimizing}
              className="btn btn-secondary"
            >
              {isOptimizing ? 'Optimizing...' : 'Optimize Settings'}
            </button>
            
            <button type="submit" className="btn btn-primary">
              Save Settings
            </button>
          </div>
        </div>
      )}
    </Form>
  );
};

export default VoiceSettings;