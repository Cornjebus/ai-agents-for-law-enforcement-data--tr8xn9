import { Pool, PoolConfig } from 'pg'; // v8.11.0
import { config } from 'dotenv'; // v16.0.0

// Load environment variables
config();

/**
 * Comprehensive interface defining PostgreSQL database configuration options
 */
export interface DatabaseConfig extends PoolConfig {
  // Core connection settings
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  
  // SSL configuration
  ssl: {
    rejectUnauthorized: boolean;
    ca: string;
    key: string;
    cert: string;
  };
  
  // Pool configuration
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statement_timeout: number;
  query_timeout: number;
  
  // Application settings
  application_name: string;
  
  // Keepalive settings
  keepalive: boolean;
  keepaliveInitialDelayMillis: number;
  
  // Monitoring settings
  poolMetrics: boolean;
  connectionLabel: string;
  
  // Replication settings
  readReplicaHosts: string[];
}

/**
 * Default database configuration with comprehensive options
 */
export const DATABASE_CONFIG: DatabaseConfig = {
  // Core connection settings from environment
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'revenue_platform',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  
  // SSL configuration
  ssl: {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ca: process.env.DB_SSL_CA || '',
    key: process.env.DB_SSL_KEY || '',
    cert: process.env.DB_SSL_CERT || ''
  },
  
  // Pool configuration
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '5000', 10),
  
  // Application settings
  application_name: process.env.APP_NAME || 'revenue-platform',
  
  // Keepalive settings
  keepalive: process.env.DB_KEEPALIVE !== 'false',
  keepaliveInitialDelayMillis: parseInt(process.env.DB_KEEPALIVE_DELAY || '30000', 10),
  
  // Monitoring settings
  poolMetrics: process.env.DB_POOL_METRICS !== 'false',
  connectionLabel: process.env.DB_CONNECTION_LABEL || 'primary',
  
  // Replication settings
  readReplicaHosts: (process.env.DB_READ_REPLICAS || '').split(',').filter(Boolean)
};

/**
 * Returns the default database configuration with comprehensive options
 * @returns DatabaseConfig object with all options configured
 */
export function getDefaultDatabaseConfig(): DatabaseConfig {
  return { ...DATABASE_CONFIG };
}

/**
 * Creates and configures a new PostgreSQL connection pool with comprehensive options and monitoring
 * @param options DatabaseConfig options to override defaults
 * @returns Configured PostgreSQL connection pool instance
 */
export function createDatabasePool(options: Partial<DatabaseConfig> = {}): Pool {
  const config = {
    ...DATABASE_CONFIG,
    ...options
  };

  // Create the connection pool
  const pool = new Pool(config);

  // Set up error handling
  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
  });

  // Set up connection monitoring
  if (config.poolMetrics) {
    pool.on('connect', () => {
      console.info(`New database connection established (${config.connectionLabel})`);
    });

    pool.on('acquire', () => {
      console.debug(`Connection acquired from pool (${config.connectionLabel})`);
    });

    pool.on('remove', () => {
      console.info(`Connection removed from pool (${config.connectionLabel})`);
    });
  }

  // Configure connection validation
  pool.on('connect', (client) => {
    // Set application name for connection tracking
    client.query(`SET application_name TO '${config.application_name}'`);
    
    // Set statement timeout
    if (config.statement_timeout) {
      client.query(`SET statement_timeout TO ${config.statement_timeout}`);
    }
    
    // Configure connection label if specified
    if (config.connectionLabel) {
      client.query(`COMMENT ON CONNECTION IS '${config.connectionLabel}'`);
    }
  });

  // Handle read replica configuration
  if (config.readReplicaHosts && config.readReplicaHosts.length > 0) {
    console.info(`Configured ${config.readReplicaHosts.length} read replicas`);
  }

  return pool;
}

/**
 * Helper function to validate database connection configuration
 * @param config DatabaseConfig to validate
 * @throws Error if configuration is invalid
 */
function validateDatabaseConfig(config: DatabaseConfig): void {
  if (!config.host) throw new Error('Database host is required');
  if (!config.port) throw new Error('Database port is required');
  if (!config.database) throw new Error('Database name is required');
  if (!config.user) throw new Error('Database user is required');
  
  // Validate SSL configuration if enabled
  if (config.ssl) {
    if (config.ssl.rejectUnauthorized && !config.ssl.ca) {
      throw new Error('SSL CA certificate is required when SSL verification is enabled');
    }
  }
  
  // Validate pool configuration
  if (config.max <= 0) throw new Error('Pool max connections must be greater than 0');
  if (config.idleTimeoutMillis < 0) throw new Error('Idle timeout must be non-negative');
  if (config.connectionTimeoutMillis < 0) throw new Error('Connection timeout must be non-negative');
}

// Export configured pool instance for direct use
export const defaultPool = createDatabasePool();