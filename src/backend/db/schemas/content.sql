-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create enum type for content types
CREATE TYPE content_type AS ENUM (
    'TEXT',
    'IMAGE',
    'VIDEO',
    'AUDIO'
);

-- Create enum type for content distribution platforms
CREATE TYPE content_platform AS ENUM (
    'LINKEDIN',
    'TWITTER',
    'TIKTOK'
);

-- Create enum type for content workflow status
CREATE TYPE content_status AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'SCHEDULED',
    'PUBLISHED',
    'ARCHIVED'
);

-- Create function to validate content metadata
CREATE OR REPLACE FUNCTION validate_content_metadata(metadata JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        jsonb_typeof(metadata) = 'object' AND
        metadata ? 'version' AND
        metadata ? 'language' AND
        metadata ? 'target_audience'
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to validate content metrics
CREATE OR REPLACE FUNCTION validate_content_metrics(metrics JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        jsonb_typeof(metrics) = 'object' AND
        metrics ? 'impressions' AND
        metrics ? 'engagements' AND
        metrics ? 'conversions'
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_content_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate status transitions
CREATE OR REPLACE FUNCTION validate_content_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status = 'DRAFT' AND NEW.status NOT IN ('PENDING_APPROVAL', 'ARCHIVED')) OR
       (OLD.status = 'PENDING_APPROVAL' AND NEW.status NOT IN ('APPROVED', 'DRAFT', 'ARCHIVED')) OR
       (OLD.status = 'APPROVED' AND NEW.status NOT IN ('SCHEDULED', 'ARCHIVED')) OR
       (OLD.status = 'SCHEDULED' AND NEW.status NOT IN ('PUBLISHED', 'ARCHIVED')) OR
       (OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('ARCHIVED')) OR
       (OLD.status = 'ARCHIVED' AND OLD.status != NEW.status) THEN
        RAISE EXCEPTION 'Invalid content status transition from % to %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create content table with partitioning
CREATE TABLE content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    type content_type NOT NULL,
    platform content_platform NOT NULL,
    content TEXT NOT NULL CHECK (length(content) > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (validate_content_metadata(metadata)),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (validate_content_metrics(metrics)),
    status content_status NOT NULL DEFAULT 'DRAFT',
    scheduled_for TIMESTAMP WITH TIME ZONE CHECK (scheduled_for > created_at),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional constraints
    CONSTRAINT content_scheduling_status CHECK (
        (status = 'SCHEDULED' AND scheduled_for IS NOT NULL) OR
        (status != 'SCHEDULED')
    )
) PARTITION BY RANGE (created_at);

-- Create indexes
CREATE INDEX content_campaign_id_idx ON content USING BTREE (campaign_id);
CREATE INDEX content_status_idx ON content USING BTREE (status);
CREATE INDEX content_type_platform_idx ON content USING BTREE (type, platform);
CREATE INDEX content_scheduled_for_idx ON content USING BRIN (scheduled_for);
CREATE INDEX content_metadata_idx ON content USING GIN (metadata jsonb_path_ops);
CREATE INDEX content_metrics_idx ON content USING GIN (metrics jsonb_path_ops);
CREATE INDEX content_recent_idx ON content USING BTREE (created_at) 
    WHERE created_at >= NOW() - INTERVAL '30 days';

-- Create triggers
CREATE TRIGGER update_content_timestamp
    BEFORE UPDATE ON content
    FOR EACH ROW
    EXECUTE FUNCTION update_content_timestamp();

CREATE TRIGGER validate_content_status
    BEFORE UPDATE ON content
    FOR EACH ROW
    EXECUTE FUNCTION validate_content_status_transition();

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
        partition_name := 'content_p' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF content 
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
CREATE OR REPLACE FUNCTION create_content_partition()
RETURNS void AS $$
DECLARE
    start_date TIMESTAMP;
    end_date TIMESTAMP;
    partition_name TEXT;
BEGIN
    start_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'content_p' || TO_CHAR(start_date, 'YYYY_MM');
    
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF content 
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
COMMENT ON TABLE content IS 'Stores AI-generated and managed content for marketing campaigns';
COMMENT ON COLUMN content.metadata IS 'JSONB containing content metadata including version, language, and target audience';
COMMENT ON COLUMN content.metrics IS 'JSONB containing content performance metrics and analytics data';
COMMENT ON INDEX content_campaign_id_idx IS 'Optimizes queries filtering by campaign';
COMMENT ON INDEX content_metadata_idx IS 'Optimizes queries on JSONB metadata';
COMMENT ON INDEX content_metrics_idx IS 'Optimizes queries on JSONB metrics data';