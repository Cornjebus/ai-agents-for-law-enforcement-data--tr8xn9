-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum type for metric types
CREATE TYPE metric_type AS ENUM (
    'LATENCY_API',
    'LATENCY_VOICE',
    'LATENCY_CONTENT',
    'THROUGHPUT_REQUESTS',
    'THROUGHPUT_CONCURRENT_USERS',
    'ERROR_RATE_SYSTEM',
    'ERROR_RATE_API',
    'ERROR_RATE_INTEGRATION',
    'CONCURRENT_USERS_TOTAL',
    'CONCURRENT_USERS_ACTIVE',
    'CONCURRENT_USERS_PEAK',
    'REVENUE_DAILY',
    'REVENUE_MONTHLY',
    'REVENUE_ANNUAL',
    'CONVERSION_RATE_CAMPAIGN',
    'CONVERSION_RATE_OVERALL',
    'UPTIME_SYSTEM',
    'UPTIME_SERVICE',
    'UPTIME_DATABASE',
    'PERFORMANCE_QUERY',
    'PERFORMANCE_PROCESSING',
    'PERFORMANCE_RESPONSE'
);

-- Create enum type for metric units
CREATE TYPE metric_unit AS ENUM (
    'MILLISECONDS',
    'REQUESTS_PER_SECOND',
    'PERCENTAGE',
    'COUNT',
    'DOLLARS',
    'BYTES',
    'SECONDS',
    'RATIO'
);

-- Create metrics table with partitioning
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type metric_type NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit metric_unit NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Value range constraints based on metric type
    CONSTRAINT metrics_value_range CHECK (
        CASE 
            WHEN type LIKE 'LATENCY_%' THEN value >= 0 AND value <= 60000 -- Max 60 seconds in ms
            WHEN type LIKE 'ERROR_RATE_%' THEN value >= 0 AND value <= 100 -- Percentage
            WHEN type LIKE 'UPTIME_%' THEN value >= 0 AND value <= 100 -- Percentage
            WHEN type LIKE 'CONVERSION_RATE_%' THEN value >= 0 AND value <= 100 -- Percentage
            WHEN unit = 'PERCENTAGE' THEN value >= 0 AND value <= 100
            ELSE value >= 0
        END
    )
) PARTITION BY RANGE (timestamp);

-- Create indexes
CREATE INDEX metrics_timestamp_idx ON metrics USING BTREE (timestamp);
CREATE INDEX metrics_type_timestamp_idx ON metrics USING BTREE (type, timestamp);
CREATE INDEX metrics_name_timestamp_idx ON metrics USING BTREE (name, timestamp);
CREATE INDEX metrics_tags_idx ON metrics USING GIN (tags);
CREATE INDEX metrics_recent_data_idx ON metrics USING BTREE (timestamp) 
    WHERE timestamp >= NOW() - INTERVAL '7 days';

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
        partition_name := 'metrics_p' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF metrics 
            FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        
        -- Create local indexes on partition
        EXECUTE format(
            'CREATE INDEX %I ON %I USING BTREE (timestamp)',
            partition_name || '_timestamp_idx',
            partition_name
        );
        
        start_date := end_date;
    END LOOP;
END $$;

-- Create function for automatic partition management
CREATE OR REPLACE FUNCTION create_metrics_partition()
RETURNS void AS $$
DECLARE
    start_date TIMESTAMP;
    end_date TIMESTAMP;
    partition_name TEXT;
BEGIN
    -- Create partition for next month if it doesn't exist
    start_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'metrics_p' || TO_CHAR(start_date, 'YYYY_MM');
    
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF metrics 
            FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        
        -- Create local indexes on new partition
        EXECUTE format(
            'CREATE INDEX %I ON %I USING BTREE (timestamp)',
            partition_name || '_timestamp_idx',
            partition_name
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function for partition cleanup
CREATE OR REPLACE FUNCTION cleanup_old_metrics_partitions()
RETURNS void AS $$
DECLARE
    partition_date TIMESTAMP;
    partition_name TEXT;
BEGIN
    -- Drop partitions older than retention period (12 months)
    FOR partition_name IN
        SELECT relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE relname LIKE 'metrics_p%'
        AND TO_TIMESTAMP(SPLIT_PART(relname, 'p', 2), 'YYYY_MM') < NOW() - INTERVAL '12 months'
    LOOP
        EXECUTE format('DROP TABLE %I', partition_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Comments for maintenance procedures
COMMENT ON TABLE metrics IS 'Stores system-wide performance metrics, analytics data, and monitoring information';
COMMENT ON FUNCTION create_metrics_partition() IS 'Creates new partition for next month. Schedule monthly execution.';
COMMENT ON FUNCTION cleanup_old_metrics_partitions() IS 'Removes partitions older than 12 months. Schedule quarterly execution.';

-- Comments for optimization guidance
COMMENT ON INDEX metrics_timestamp_idx IS 'Optimizes time-based queries across all metrics';
COMMENT ON INDEX metrics_type_timestamp_idx IS 'Optimizes queries filtering by metric type and time range';
COMMENT ON INDEX metrics_name_timestamp_idx IS 'Optimizes queries filtering by metric name and time range';
COMMENT ON INDEX metrics_tags_idx IS 'Optimizes queries filtering by JSONB tags';
COMMENT ON INDEX metrics_recent_data_idx IS 'Optimizes queries for recent data (last 7 days)';