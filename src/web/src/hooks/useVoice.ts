/**
 * @fileoverview Enhanced custom React hook for managing voice-related functionality
 * including call handling, voice synthesis, speech recognition, and performance monitoring
 * Version: 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // v18.2.0
import { useSelector, useDispatch } from 'react-redux'; // v8.1.0
import { VoiceService } from '../services/voice.service';
import {
  IVoiceCall,
  IVoiceSynthesisOptions,
  VoiceCallStatus,
  VoiceEngine,
  VoiceQuality,
  RoutingStrategy,
  IGeographicRouting,
  VoiceCallMetrics
} from '../types/voice';

// Performance and optimization constants
const VOICE_SYNTHESIS_TIMEOUT = 5000;
const RECOGNITION_TIMEOUT = 10000;
const MAX_AUDIO_SIZE = 5242880; // 5MB
const MIN_ACCEPTABLE_RTT = 200;
const RETRY_ATTEMPTS = 3;
const CACHE_DURATION = 3600000; // 1 hour
const METRIC_COLLECTION_INTERVAL = 1000;
const VOICE_QUALITY_THRESHOLD = 0.8;

// Initialize voice service
const voiceService = new VoiceService();

/**
 * Enhanced custom hook for managing voice-related functionality
 * with performance optimization and geographic routing
 */
export function useVoice() {
  const dispatch = useDispatch();
  
  // Local state management
  const [calls, setCalls] = useState<IVoiceCall[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [metrics, setMetrics] = useState<VoiceCallMetrics | null>(null);
  const [geographicRouting, setGeographicRouting] = useState<IGeographicRouting | null>(null);

  /**
   * Initialize WebSocket connection for real-time metrics
   */
  useEffect(() => {
    let metricsInterval: NodeJS.Timeout;

    const initializeMetricsMonitoring = async () => {
      try {
        metricsInterval = setInterval(async () => {
          const activeCall = calls.find(call => 
            call.status === VoiceCallStatus.IN_PROGRESS
          );

          if (activeCall) {
            const callMetrics = await voiceService.monitorCallQuality(activeCall.id);
            setMetrics(callMetrics);
          }
        }, METRIC_COLLECTION_INTERVAL);
      } catch (err) {
        console.error('Metrics monitoring error:', err);
        setError(err as Error);
      }
    };

    initializeMetricsMonitoring();

    return () => {
      if (metricsInterval) {
        clearInterval(metricsInterval);
      }
    };
  }, [calls]);

  /**
   * Initialize and optimize geographic routing
   */
  useEffect(() => {
    const initializeRouting = async () => {
      try {
        const routing = await voiceService.getGeographicRouting();
        setGeographicRouting(routing);
      } catch (err) {
        console.error('Geographic routing error:', err);
        setError(err as Error);
      }
    };

    initializeRouting();
  }, []);

  /**
   * Initiates an outbound call with performance optimization
   */
  const initiateCall = useCallback(async (
    phoneNumber: string,
    campaignId: string,
    voiceConfig?: Partial<IVoiceSynthesisOptions>,
    routingOptions?: Partial<IGeographicRouting>
  ): Promise<IVoiceCall> => {
    try {
      setIsProcessing(true);
      setError(null);

      // Configure optimal routing
      const routing = routingOptions || geographicRouting || {
        region: 'us-west-1',
        datacenter: 'primary',
        latency: 0,
        backupRegion: 'us-east-1',
        routingStrategy: RoutingStrategy.LOWEST_LATENCY
      };

      // Initialize call with enhanced configuration
      const call = await voiceService.initiateCall(phoneNumber, campaignId, {
        engine: VoiceEngine.NEURAL_HD,
        quality: VoiceQuality.HIGH,
        ...voiceConfig
      });

      setCalls(prevCalls => [...prevCalls, call]);
      return call;
    } catch (err) {
      console.error('Call initiation error:', err);
      setError(err as Error);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [geographicRouting]);

  /**
   * Synthesizes voice with quality optimization
   */
  const synthesizeVoice = useCallback(async (
    options: IVoiceSynthesisOptions
  ): Promise<ArrayBuffer> => {
    try {
      setIsProcessing(true);
      setError(null);

      const synthesis = await voiceService.synthesizeVoice({
        ...options,
        quality: options.quality || VoiceQuality.HIGH,
        engine: options.engine || VoiceEngine.NEURAL_HD
      });

      return synthesis;
    } catch (err) {
      console.error('Voice synthesis error:', err);
      setError(err as Error);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Recognizes speech with enhanced accuracy
   */
  const recognizeSpeech = useCallback(async (
    audioData: ArrayBuffer
  ): Promise<string> => {
    try {
      setIsProcessing(true);
      setError(null);

      if (audioData.byteLength > MAX_AUDIO_SIZE) {
        throw new Error('Audio size exceeds maximum limit');
      }

      const transcription = await voiceService.recognizeSpeech(audioData);
      return transcription;
    } catch (err) {
      console.error('Speech recognition error:', err);
      setError(err as Error);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    // Call management
    calls,
    initiateCall,
    isProcessing,
    error,

    // Voice processing
    synthesizeVoice,
    recognizeSpeech,

    // Performance monitoring
    metrics,
    geographicRouting,

    // Current state
    hasActiveCalls: calls.some(call => 
      call.status === VoiceCallStatus.IN_PROGRESS
    ),
    callCount: calls.length
  };
}