-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create enum types for lead status and interaction types
CREATE TYPE lead_status AS ENUM (
    'NEW',
    'QUALIFYING',
    'QUALIFIED',
    'NURTURING',
    'SALES_READY',
    'CONVERTED',
    'DISQUALIFIED'
);

CREATE TYPE interaction_type AS ENUM (
    'CALL',
    'EMAIL',
    'SOCIAL',
    'WEBSITE',
    'DEMO',
    'MEETING',
    'OTHER'
);

-- Create function to calculate lead score
CREATE OR REPLACE FUNCTION generate_lead_score()
RETURNS TRIGGER AS $$
DECLARE
    base_score INTEGER := 0;
    interaction_score INTEGER := 0;
    engagement_velocity FLOAT := 0;
    recent_interactions JSONB;
BEGIN
    -- Calculate base score from metadata
    IF NEW.metadata ? 'company_size' THEN
        base_score := base_score + (CASE 
            WHEN NEW.metadata->>'company_size' = 'ENTERPRISE' THEN 30
            WHEN NEW.metadata->>'company_size' = 'MID_MARKET' THEN 20
            WHEN NEW.metadata->>'company_size' = 'SMB' THEN 10
            ELSE 0
        END);
    END IF;

    IF NEW.metadata ? 'industry' THEN
        base_score := base_score + (CASE 
            WHEN NEW.metadata->>'industry' = 'TECHNOLOGY' THEN 25
            WHEN NEW.metadata->>'industry' = 'FINANCE' THEN 20
            WHEN NEW.metadata->>'industry' = 'HEALTHCARE' THEN 15
            ELSE 10
        END);
    END IF;

    -- Calculate interaction score with time decay
    SELECT COALESCE(jsonb_agg(interaction), '[]'::jsonb)
    INTO recent_interactions
    FROM (
        SELECT *
        FROM lead_interactions
        WHERE lead_id = NEW.id
        ORDER BY created_at DESC
        LIMIT 10
    ) interaction;

    IF jsonb_array_length(recent_interactions) > 0 THEN
        interaction_score := interaction_score + (
            SELECT SUM(
                CASE 
                    WHEN (interaction->>'outcome')::text = 'POSITIVE' THEN 10
                    WHEN (interaction->>'outcome')::text = 'NEUTRAL' THEN 5
                    ELSE -5
                END * 
                CASE 
                    WHEN (interaction->>'priority')::integer >= 8 THEN 2
                    ELSE 1
                END
            )
            FROM jsonb_array_elements(recent_interactions) interaction
        );
    END IF;

    -- Calculate engagement velocity
    engagement_velocity := COALESCE(
        (SELECT COUNT(*) FROM lead_interactions 
         WHERE lead_id = NEW.id 
         AND created_at >= NOW() - INTERVAL '30 days') / 30.0,
        0
    );

    -- Update final score
    NEW.score := GREATEST(0, base_score + interaction_score + (engagement_velocity * 10)::integer);
    
    -- Update score history
    NEW.score_history := COALESCE(NEW.score_history, '[]'::jsonb) || jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'score', NEW.score,
        'base_score', base_score,
        'interaction_score', interaction_score,
        'engagement_velocity', engagement_velocity
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create leads table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    status lead_status NOT NULL DEFAULT 'NEW',
    score INTEGER DEFAULT 0,
    score_history JSONB DEFAULT '[]'::jsonb,
    consent_status JSONB DEFAULT '{"marketing": false, "data_processing": false}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_interaction_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_consent_status CHECK (
        jsonb_typeof(consent_status->'marketing') = 'boolean' AND
        jsonb_typeof(consent_status->'data_processing') = 'boolean'
    )
);

-- Create lead interactions table
CREATE TABLE lead_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    type interaction_type NOT NULL,
    outcome VARCHAR(50) CHECK (outcome IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
    priority INTEGER DEFAULT 0 CHECK (priority BETWEEN 0 AND 10),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 10)
);

-- Create indexes
CREATE INDEX idx_leads_score_status ON leads USING BTREE (score DESC, status);
CREATE INDEX idx_leads_campaign ON leads USING BTREE (campaign_id);
CREATE INDEX idx_leads_email ON leads USING BTREE (email);
CREATE INDEX idx_leads_company ON leads USING BTREE (company);
CREATE INDEX idx_leads_metadata ON leads USING GIN (metadata);
CREATE INDEX idx_leads_active ON leads USING BTREE (status, updated_at) 
    WHERE status NOT IN ('CONVERTED', 'DISQUALIFIED');
CREATE INDEX idx_lead_interactions_lead ON lead_interactions USING BTREE (lead_id, created_at);
CREATE INDEX idx_lead_interactions_type ON lead_interactions USING BTREE (type, outcome);

-- Create triggers
CREATE TRIGGER update_lead_score
    BEFORE INSERT OR UPDATE OF metadata, status ON leads
    FOR EACH ROW
    EXECUTE FUNCTION generate_lead_score();

CREATE TRIGGER update_lead_timestamp
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Create function to update last interaction timestamp
CREATE OR REPLACE FUNCTION update_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE leads
    SET last_interaction_at = NEW.created_at
    WHERE id = NEW.lead_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for last interaction update
CREATE TRIGGER update_lead_last_interaction
    AFTER INSERT ON lead_interactions
    FOR EACH ROW
    EXECUTE FUNCTION update_last_interaction();

-- Add comments
COMMENT ON TABLE leads IS 'Stores lead information with enhanced scoring and tracking capabilities';
COMMENT ON TABLE lead_interactions IS 'Tracks all interactions with leads including outcomes and priorities';
COMMENT ON COLUMN leads.score IS 'Calculated lead score based on metadata, interactions, and engagement';
COMMENT ON COLUMN leads.consent_status IS 'GDPR and CCPA compliance tracking for marketing and data processing consent';
COMMENT ON COLUMN leads.metadata IS 'Additional lead information in JSONB format for flexible data storage';