/**
 * @fileoverview Enterprise-grade campaign form component with AI-driven configuration
 * and optimization capabilities for the Autonomous Revenue Generation Platform
 * @version 1.0.0
 */

import React, { useRef, useState, useCallback } from 'react';
import { z } from 'zod'; // v3.22.0
import Form from '../shared/Form';
import { ICampaign, CampaignType, CampaignStatus } from '../../types/campaign';

// AI model configuration defaults
const AI_MODEL_CONFIGS = {
  GPT4: {
    temperature: 0.7,
    maxTokens: 8000,
    contextWindow: 100000
  },
  CLAUDE: {
    temperature: 0.8,
    maxTokens: 100000,
    contextWindow: 100000
  }
};

// Voice synthesis options
const VOICE_OPTIONS = [
  { id: 'en-US-Neural1', name: 'Professional Male (US)', provider: 'AWS Polly' },
  { id: 'en-US-Neural2', name: 'Professional Female (US)', provider: 'AWS Polly' },
  { id: 'en-GB-Neural1', name: 'Professional Male (UK)', provider: 'AWS Polly' }
];

// Campaign form validation schema
const CAMPAIGN_FORM_VALIDATION_SCHEMA = z.object({
  name: z.string().min(3).max(100),
  type: z.nativeEnum(CampaignType),
  description: z.string().max(1000),
  config: z.object({
    budget: z.object({
      daily: z.number().positive(),
      total: z.number().positive(),
      alerts: z.object({
        threshold: z.number().min(0).max(1),
        email: z.array(z.string().email())
      })
    }),
    targeting: z.object({
      audience: z.array(z.string()),
      locations: z.array(z.object({
        type: z.string(),
        coordinates: z.array(z.number()).length(2)
      })),
      interests: z.array(z.string()),
      exclusions: z.array(z.string())
    }),
    aiConfig: z.object({
      model: z.string(),
      temperature: z.number().min(0).max(1),
      maxTokens: z.number().positive(),
      voice: z.object({
        provider: z.string(),
        voiceId: z.string(),
        language: z.string(),
        speed: z.number().min(0.5).max(2)
      }).optional(),
      contextWindow: z.number().positive()
    }),
    optimization: z.object({
      enabled: z.boolean(),
      target: z.string(),
      strategy: z.string(),
      constraints: z.object({
        minROAS: z.number().positive(),
        maxCPA: z.number().positive()
      }),
      autoAdjust: z.object({
        budget: z.boolean(),
        targeting: z.boolean(),
        schedule: z.boolean()
      })
    })
  })
});

// Campaign form props interface
interface CampaignFormProps {
  campaign?: ICampaign;
  onSubmit: (campaign: ICampaign) => Promise<void>;
  onCancel: () => void;
  aiModels: Array<{
    id: string;
    name: string;
    capabilities: string[];
  }>;
  voiceOptions: typeof VOICE_OPTIONS;
}

/**
 * Enhanced campaign form component with AI configuration capabilities
 */
const CampaignForm: React.FC<CampaignFormProps> = ({
  campaign,
  onSubmit,
  onCancel,
  aiModels,
  voiceOptions
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [isAIEnabled, setIsAIEnabled] = useState(campaign?.config.optimization.enabled ?? true);
  const [selectedModel, setSelectedModel] = useState(campaign?.config.aiConfig.model ?? aiModels[0].id);

  // Handle form submission with AI validation
  const handleSubmit = useCallback(async (formData: Record<string, any>) => {
    const campaignData: ICampaign = {
      id: campaign?.id ?? crypto.randomUUID(),
      organizationId: campaign?.organizationId ?? '',
      name: formData.name,
      description: formData.description,
      type: formData.type,
      status: campaign?.status ?? CampaignStatus.DRAFT,
      config: {
        budget: formData.config.budget,
        targeting: formData.config.targeting,
        aiConfig: {
          model: formData.config.aiConfig.model,
          temperature: AI_MODEL_CONFIGS[formData.config.aiConfig.model].temperature,
          maxTokens: AI_MODEL_CONFIGS[formData.config.aiConfig.model].maxTokens,
          voice: formData.config.aiConfig.voice,
          contextWindow: AI_MODEL_CONFIGS[formData.config.aiConfig.model].contextWindow
        },
        optimization: {
          enabled: isAIEnabled,
          target: formData.config.optimization.target,
          strategy: formData.config.optimization.strategy,
          constraints: formData.config.optimization.constraints,
          autoAdjust: formData.config.optimization.autoAdjust
        }
      },
      startDate: new Date(),
      endDate: null,
      createdAt: campaign?.createdAt ?? new Date(),
      updatedAt: new Date(),
      lastOptimizedAt: null
    };

    await onSubmit(campaignData);
  }, [campaign, isAIEnabled, onSubmit]);

  return (
    <Form
      onSubmit={handleSubmit}
      validationSchema={CAMPAIGN_FORM_VALIDATION_SCHEMA}
      initialValues={campaign}
      enableAIValidation
      className="campaign-form"
      accessibilityConfig={{
        ariaLabel: 'Campaign creation form',
        focusOnMount: true
      }}
    >
      <div className="form-section">
        <h2>Campaign Details</h2>
        <div className="form-group">
          <label htmlFor="name">Campaign Name</label>
          <input
            type="text"
            id="name"
            name="name"
            required
            maxLength={100}
            placeholder="Enter campaign name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="type">Campaign Type</label>
          <select id="type" name="type" required>
            {Object.values(CampaignType).map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            maxLength={1000}
            placeholder="Enter campaign description"
          />
        </div>
      </div>

      <div className="form-section">
        <h2>AI Configuration</h2>
        <div className="form-group">
          <label htmlFor="aiModel">AI Model</label>
          <select
            id="aiModel"
            name="config.aiConfig.model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {aiModels.map(model => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
        </div>

        {formData?.type === CampaignType.OUTBOUND_CALL && (
          <div className="form-group">
            <label htmlFor="voice">Voice Selection</label>
            <select id="voice" name="config.aiConfig.voice.voiceId">
              {voiceOptions.map(voice => (
                <option key={voice.id} value={voice.id}>{voice.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="form-section">
        <h2>Optimization Settings</h2>
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isAIEnabled}
              onChange={(e) => setIsAIEnabled(e.target.checked)}
              name="config.optimization.enabled"
            />
            Enable AI Optimization
          </label>
        </div>

        {isAIEnabled && (
          <>
            <div className="form-group">
              <label htmlFor="target">Optimization Target</label>
              <select id="target" name="config.optimization.target">
                <option value="revenue">Revenue</option>
                <option value="leads">Lead Generation</option>
                <option value="roas">ROAS</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="minROAS">Minimum ROAS</label>
              <input
                type="number"
                id="minROAS"
                name="config.optimization.constraints.minROAS"
                min="1"
                step="0.1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="maxCPA">Maximum CPA</label>
              <input
                type="number"
                id="maxCPA"
                name="config.optimization.constraints.maxCPA"
                min="0"
                step="0.01"
              />
            </div>
          </>
        )}
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {campaign ? 'Update Campaign' : 'Create Campaign'}
        </button>
      </div>
    </Form>
  );
};

export default CampaignForm;