-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create enum types for campaign status and type
CREATE TYPE campaign_status AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'CANCELLED',
    'FAILED'
);

CREATE TYPE campaign_type AS ENUM (
    'OUTBOUND_CALL',
    'SOCIAL_MEDIA',
    'EMAIL_SEQUENCE',
    'MULTI_CHANNEL',
    'LEAD_NURTURE',
    'DEMO_SCHEDULING'
);

-- Create function to validate campaign configuration
CREATE OR REPLACE FUNCTION validate_campaign_config(config JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check required configuration fields
    IF NOT (
        config ? 'target_audience' AND
        config ? 'goals' AND
        config ? 'channels' AND
        config ? 'content_settings'
    ) THEN
        RETURN FALSE;
    END IF;

    -- Validate configuration structure
    RETURN (
        jsonb_typeof(config->'target_audience') = 'object' AND
        jsonb_typeof(config->'goals') = 'array' AND
        jsonb_typeof(config->'channels') = 'array' AND
        jsonb_typeof(config->'content_settings') = 'object'
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to validate status transitions
CREATE OR REPLACE FUNCTION validate_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Define valid status transitions
    IF (OLD.status = 'DRAFT' AND NEW.status NOT IN ('SCHEDULED', 'CANCELLED')) OR
       (OLD.status = 'SCHEDULED' AND NEW.status NOT IN ('ACTIVE', 'CANCELLED')) OR
       (OLD.status = 'ACTIVE' AND NEW.status NOT IN ('PAUSED', 'COMPLETED', 'FAILED')) OR
       (OLD.status = 'PAUSED' AND NEW.status NOT IN ('ACTIVE', 'CANCELLED')) OR
       (OLD.status IN ('COMPLETED', 'CANCELLED', 'FAILED') AND OLD.status != NEW.status) THEN
        RAISE EXCEPTION 'Invalid campaign status transition from % to %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_campaign_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create campaigns table with partitioning
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status campaign_status NOT NULL DEFAULT 'DRAFT',
    type campaign_type NOT NULL,
    configuration JSONB NOT NULL,
    metrics JSONB DEFAULT '{}'::jsonb,
    budget_limit DECIMAL(12,2) NOT NULL CHECK (budget_limit > 0),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT campaigns_name_organization_unique UNIQUE (name, organization_id),
    CONSTRAINT campaigns_dates_check CHECK (end_date IS NULL OR end_date > start_date),
    CONSTRAINT campaigns_config_valid CHECK (validate_campaign_config(configuration))
) PARTITION BY RANGE (created_at);

-- Create indexes
CREATE INDEX campaigns_organization_id_idx ON campaigns USING BTREE (organization_id);
CREATE INDEX campaigns_status_type_idx ON campaigns USING BTREE (status, type);
CREATE INDEX campaigns_active_org_idx ON campaigns USING BTREE (organization_id, status) 
    WHERE status = 'ACTIVE';
CREATE INDEX campaigns_configuration_idx ON campaigns USING GIN (configuration jsonb_path_ops);
CREATE INDEX campaigns_metrics_idx ON campaigns USING GIN (metrics jsonb_path_ops);
CREATE INDEX campaigns_date_range_idx ON campaigns USING BTREE (start_date, end_date);

-- Create triggers
CREATE TRIGGER update_campaign_timestamp
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_campaign_timestamp();

CREATE TRIGGER validate_campaign_status
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION validate_status_transition();

-- Create initial partitions for the next 12 months
DO $$
DECLARE
    start_date TIMESTAMP;
    end_date TIMESTAMP;
    partition_name TEXT;
BEGIN
    start_date := DATE_TRUNC('month', CURRENT_DATE);
    FOR i IN 0..11 LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'campaigns_p' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF campaigns 
            FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        
        -- Create local indexes on partition
        EXECUTE format(
            'CREATE INDEX %I ON %I USING BTREE (created_at)',
            partition_name || '_created_at_idx',
            partition_name
        );
        
        start_date := end_date;
    END LOOP;
END $$;

-- Create function for automatic partition management
CREATE OR REPLACE FUNCTION create_campaign_partition()
RETURNS void AS $$
DECLARE
    start_date TIMESTAMP;
    end_date TIMESTAMP;
    partition_name TEXT;
BEGIN
    start_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'campaigns_p' || TO_CHAR(start_date, 'YYYY_MM');
    
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF campaigns 
            FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        
        EXECUTE format(
            'CREATE INDEX %I ON %I USING BTREE (created_at)',
            partition_name || '_created_at_idx',
            partition_name
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE campaigns IS 'Stores campaign information for the autonomous revenue generation platform';
COMMENT ON COLUMN campaigns.configuration IS 'JSONB containing campaign configuration including target audience, goals, and content settings';
COMMENT ON COLUMN campaigns.metrics IS 'JSONB containing campaign performance metrics and analytics data';
COMMENT ON INDEX campaigns_organization_id_idx IS 'Optimizes queries filtering by organization';
COMMENT ON INDEX campaigns_configuration_idx IS 'Optimizes queries on JSONB configuration data';
COMMENT ON INDEX campaigns_metrics_idx IS 'Optimizes queries on JSONB metrics data';