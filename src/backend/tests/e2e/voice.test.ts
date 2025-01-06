import { describe, beforeAll, afterAll, test, expect } from '@jest/globals'; // v29.0.0
import { GenericContainer, StartedPostgreSqlContainer, StartedRedisContainer } from 'testcontainers'; // v9.0.0
import supertest from 'supertest'; // v6.3.3
import AWS from 'aws-sdk-mock'; // v5.8.0
import { Express } from 'express';

import { CallController } from '../../services/voice/controllers/call.controller';
import { Call, CallStatus } from '../../services/voice/models/call.model';
import { SynthesisService } from '../../services/voice/services/synthesis.service';
import { IMetric, MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

/**
 * Interface for test context including geographic and performance data
 */
interface TestContext {
  postgresContainer: StartedPostgreSqlContainer;
  redisContainer: StartedRedisContainer;
  app: Express;
  testCampaignId: string;
  testLeadId: string;
  testPhoneNumber: string;
  testRegions: string[];
  performanceMetrics: {
    latencies: number[];
    processingTimes: number[];
    routingEfficiency: number;
  };
  geographicConfig: {
    preferredRegion: string;
    maxLatency: number;
    failoverEnabled: boolean;
  };
}

// Test constants
const TEST_CAMPAIGN_ID = 'test-campaign-123';
const TEST_LEAD_ID = 'test-lead-456';
const TEST_PHONE_NUMBER = '+1234567890';
const TEST_REGIONS = ['us-west-2', 'us-east-1', 'eu-west-1'];
const TEST_LATENCY_THRESHOLD = 200; // 200ms RTT target

describe('Voice Call E2E Tests', () => {
  let context: TestContext;

  beforeAll(async () => {
    // Initialize test context
    context = {
      postgresContainer: await new GenericContainer('postgres:15')
        .withExposedPorts(5432)
        .withEnvironment({
          POSTGRES_USER: 'test',
          POSTGRES_PASSWORD: 'test',
          POSTGRES_DB: 'test_db'
        })
        .start(),

      redisContainer: await new GenericContainer('redis:7')
        .withExposedPorts(6379)
        .start(),

      app: {} as Express,
      testCampaignId: TEST_CAMPAIGN_ID,
      testLeadId: TEST_LEAD_ID,
      testPhoneNumber: TEST_PHONE_NUMBER,
      testRegions: TEST_REGIONS,
      performanceMetrics: {
        latencies: [],
        processingTimes: [],
        routingEfficiency: 0
      },
      geographicConfig: {
        preferredRegion: 'us-west-2',
        maxLatency: TEST_LATENCY_THRESHOLD,
        failoverEnabled: true
      }
    };

    // Mock AWS services
    AWS.mock('Polly', 'synthesizeSpeech', (params: any, callback: Function) => {
      callback(null, { AudioStream: Buffer.from('test-audio') });
    });

    AWS.mock('Polly', 'describeVoices', (params: any, callback: Function) => {
      callback(null, {
        Voices: [
          { Id: 'test-voice-1', LanguageCode: 'en-US' },
          { Id: 'test-voice-2', LanguageCode: 'en-US' }
        ]
      });
    });

    // Initialize test campaign and lead
    await initializeTestData(context);
  });

  afterAll(async () => {
    // Cleanup resources
    await context.postgresContainer.stop();
    await context.redisContainer.stop();
    AWS.restore();
  });

  test('should process voice call with geographic routing', async () => {
    // Initialize call
    const call = await initializeCall(context);
    expect(call).toBeDefined();
    expect(call.status).toBe(CallStatus.PENDING);

    // Test voice processing with geographic routing
    const voiceResult = await processVoiceStream(call.id, context);
    expect(voiceResult.success).toBe(true);
    expect(voiceResult.metrics.rttLatency).toBeLessThanOrEqual(TEST_LATENCY_THRESHOLD);

    // Verify geographic routing
    const geoMetrics = await verifyGeographicRouting(call.id, context);
    expect(geoMetrics.routingEfficiency).toBeGreaterThanOrEqual(0.85);

    // Test call completion
    const completedCall = await endCall(call.id);
    expect(completedCall.status).toBe(CallStatus.COMPLETED);
    expect(completedCall.duration).toBeGreaterThan(0);
  });

  test('should handle geographic failover scenarios', async () => {
    // Simulate primary region failure
    AWS.remock('Polly', 'synthesizeSpeech', (params: any, callback: Function) => {
      if (params.Region === context.geographicConfig.preferredRegion) {
        callback(new Error('Region unavailable'));
      } else {
        callback(null, { AudioStream: Buffer.from('test-audio') });
      }
    });

    // Initialize call with failover config
    const call = await initializeCall(context);
    expect(call).toBeDefined();

    // Test failover routing
    const voiceResult = await processVoiceStream(call.id, context);
    expect(voiceResult.success).toBe(true);
    expect(voiceResult.metrics.geographicData.region).not.toBe(context.geographicConfig.preferredRegion);

    // Verify metrics after failover
    const metrics = await getCallMetrics(call.id);
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.find(m => m.name === 'failover_success')).toBeDefined();
  });

  test('should maintain performance under load', async () => {
    const concurrentCalls = 10;
    const calls: Call[] = [];

    // Initialize concurrent calls
    for (let i = 0; i < concurrentCalls; i++) {
      const call = await initializeCall(context);
      calls.push(call);
    }

    // Process concurrent voice streams
    const results = await Promise.all(
      calls.map(call => processVoiceStream(call.id, context))
    );

    // Verify performance metrics
    const successfulCalls = results.filter(r => r.success).length;
    expect(successfulCalls).toBe(concurrentCalls);

    const avgLatency = results.reduce((sum, r) => sum + r.metrics.rttLatency, 0) / concurrentCalls;
    expect(avgLatency).toBeLessThanOrEqual(TEST_LATENCY_THRESHOLD);
  });
});

/**
 * Helper functions
 */
async function initializeTestData(context: TestContext): Promise<void> {
  // Implementation for initializing test data
}

async function initializeCall(context: TestContext): Promise<Call> {
  const controller = new CallController();
  return controller.initiateCall(
    {
      phoneNumber: context.testPhoneNumber,
      campaignId: context.testCampaignId,
      leadId: context.testLeadId,
      region: context.geographicConfig.preferredRegion
    },
    context.geographicConfig
  );
}

async function processVoiceStream(
  callId: string,
  context: TestContext
): Promise<any> {
  const controller = new CallController();
  return controller.processVoiceStream(
    callId,
    Buffer.from('test-audio-data'),
    context.geographicConfig
  );
}

async function verifyGeographicRouting(
  callId: string,
  context: TestContext
): Promise<any> {
  const controller = new CallController();
  return controller.getCallMetrics(callId);
}

async function endCall(callId: string): Promise<Call> {
  const controller = new CallController();
  return controller.endCall(callId);
}

async function getCallMetrics(callId: string): Promise<IMetric[]> {
  const controller = new CallController();
  const metrics = await controller.getCallMetrics(callId);
  return Object.values(metrics).flat();
}