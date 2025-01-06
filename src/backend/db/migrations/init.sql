-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_partman";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS security;
CREATE SCHEMA IF NOT EXISTS metrics;

-- Set search path
ALTER DATABASE revenue_platform SET search_path TO public, audit, security, metrics;

-- Create audit logging function
CREATE OR REPLACE FUNCTION audit.log_changes()
RETURNS trigger AS $$
BEGIN
    INSERT INTO audit.audit_log (
        table_name,
        operation,
        old_data,
        new_data,
        user_id,
        ip_address,
        timestamp
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') 
            THEN encrypt(to_jsonb(OLD)::text::bytea, current_setting('app.encryption_key'), 'aes')
            ELSE NULL 
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'INSERT') 
            THEN encrypt(to_jsonb(NEW)::text::bytea, current_setting('app.encryption_key'), 'aes')
            ELSE NULL 
        END,
        current_setting('app.current_user_id'),
        inet_client_addr(),
        CURRENT_TIMESTAMP
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit log table
CREATE TABLE audit.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_data BYTEA,
    new_data BYTEA,
    user_id UUID,
    ip_address INET,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL
) PARTITION BY RANGE (timestamp);

-- Create organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    encryption_key_id UUID NOT NULL,
    security_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT organizations_name_unique UNIQUE (name),
    CONSTRAINT valid_settings CHECK (jsonb_typeof(settings) = 'object'),
    CONSTRAINT valid_security_settings CHECK (jsonb_typeof(security_settings) = 'object')
);

-- Create row level security policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_access_policy ON organizations
    USING (id = ANY(current_setting('app.accessible_org_ids')::uuid[]));

-- Create performance tracking function
CREATE OR REPLACE FUNCTION metrics.track_query_performance()
RETURNS trigger AS $$
BEGIN
    INSERT INTO metrics.query_stats (
        query_id,
        database_id,
        user_id,
        query,
        execution_time,
        plan_time,
        rows_processed,
        timestamp
    ) VALUES (
        pg_stat_statements.queryid,
        pg_stat_statements.dbid,
        pg_stat_statements.userid,
        pg_stat_statements.query,
        pg_stat_statements.total_exec_time,
        pg_stat_statements.mean_plan_time,
        pg_stat_statements.rows,
        CURRENT_TIMESTAMP
    )
    FROM pg_stat_statements
    WHERE pg_stat_statements.queryid = TG_ARGV[0]::bigint;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create query stats table
CREATE TABLE metrics.query_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id BIGINT NOT NULL,
    database_id OID NOT NULL,
    user_id OID NOT NULL,
    query TEXT NOT NULL,
    execution_time DOUBLE PRECISION NOT NULL,
    plan_time DOUBLE PRECISION NOT NULL,
    rows_processed BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL
) PARTITION BY RANGE (timestamp);

-- Create indexes
CREATE INDEX idx_organizations_name ON organizations USING btree (name);
CREATE INDEX idx_organizations_created ON organizations USING brin (created_at);
CREATE INDEX idx_organizations_settings ON organizations USING gin (settings jsonb_path_ops);
CREATE INDEX idx_organizations_security ON organizations USING gin (security_settings jsonb_path_ops);

CREATE INDEX idx_audit_log_timestamp ON audit.audit_log USING brin (timestamp);
CREATE INDEX idx_audit_log_table ON audit.audit_log USING btree (table_name);
CREATE INDEX idx_audit_log_operation ON audit.audit_log USING btree (operation);

CREATE INDEX idx_query_stats_timestamp ON metrics.query_stats USING brin (timestamp);
CREATE INDEX idx_query_stats_query ON metrics.query_stats USING btree (query_id);
CREATE INDEX idx_query_stats_execution ON metrics.query_stats USING btree (execution_time);

-- Create audit triggers for organizations table
CREATE TRIGGER audit_organizations_changes
    AFTER INSERT OR UPDATE OR DELETE ON organizations
    FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

-- Create partition maintenance function
CREATE OR REPLACE FUNCTION maintenance.create_partitions()
RETURNS void AS $$
BEGIN
    PERFORM create_parent(
        'audit.audit_log',
        'timestamp',
        'native',
        'monthly',
        p_start_partition := date_trunc('month', CURRENT_DATE)
    );
    
    PERFORM create_parent(
        'metrics.query_stats',
        'timestamp',
        'native',
        'monthly',
        p_start_partition := date_trunc('month', CURRENT_DATE)
    );
END;
$$ LANGUAGE plpgsql;

-- Initialize partitions
SELECT maintenance.create_partitions();

-- Import and create referenced tables
\ir ../schemas/campaign.sql
\ir ../schemas/content.sql
\ir ../schemas/lead.sql
\ir ../schemas/metric.sql

-- Add comments
COMMENT ON TABLE organizations IS 'Core organization table with enhanced security features';
COMMENT ON TABLE audit.audit_log IS 'Encrypted audit trail for all database changes';
COMMENT ON TABLE metrics.query_stats IS 'Performance tracking for database queries';

COMMENT ON FUNCTION audit.log_changes() IS 'Handles audit logging with encryption';
COMMENT ON FUNCTION maintenance.create_partitions() IS 'Manages table partitioning';
COMMENT ON FUNCTION metrics.track_query_performance() IS 'Tracks query performance metrics';