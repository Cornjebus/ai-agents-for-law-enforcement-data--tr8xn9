import { injectable } from 'tsyringe'; // v4.8.0
import { Pool } from 'pg'; // v8.11.0
import { 
    IMetric, 
    MetricType, 
    MetricUnit, 
    IMetricQuery, 
    IMetricAggregation 
} from '../../../common/interfaces/metric.interface';
import NodeCache from 'node-cache';
import { Logger } from 'winston';

@injectable()
export class MetricModel {
    private readonly CACHE_TTL = 300; // 5 minutes cache TTL
    private readonly BATCH_SIZE = 1000; // Batch size for bulk operations
    private readonly QUERY_TIMEOUT = 30000; // 30 seconds query timeout

    constructor(
        private readonly pool: Pool,
        private readonly cache: NodeCache,
        private readonly logger: Logger
    ) {
        this.initializePool();
    }

    private initializePool(): void {
        this.pool.on('error', (err) => {
            this.logger.error('Unexpected database pool error', { error: err });
        });

        this.pool.on('connect', () => {
            this.logger.debug('New database connection established');
        });
    }

    /**
     * Creates a new metric record with validation and optimized insertion
     */
    async create(metric: IMetric): Promise<IMetric> {
        try {
            const query = `
                INSERT INTO metrics (
                    name, type, value, unit, timestamp, service,
                    environment, metadata, tags
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;

            const values = [
                metric.name,
                metric.type,
                metric.value,
                metric.unit,
                metric.timestamp,
                metric.service,
                metric.environment,
                JSON.stringify(metric.metadata),
                JSON.stringify(metric.tags)
            ];

            const client = await this.pool.connect();
            try {
                const result = await client.query(query, values);
                const createdMetric = result.rows[0];
                
                // Update cache
                const cacheKey = `metric:${createdMetric.id}`;
                this.cache.set(cacheKey, createdMetric, this.CACHE_TTL);
                
                return createdMetric;
            } finally {
                client.release();
            }
        } catch (error) {
            this.logger.error('Error creating metric', { error, metric });
            throw error;
        }
    }

    /**
     * Retrieves a metric by ID with caching support
     */
    async findById(id: string): Promise<IMetric | null> {
        try {
            // Check cache first
            const cacheKey = `metric:${id}`;
            const cachedMetric = this.cache.get<IMetric>(cacheKey);
            
            if (cachedMetric) {
                return cachedMetric;
            }

            const query = 'SELECT * FROM metrics WHERE id = $1';
            const result = await this.pool.query(query, [id]);
            
            if (result.rows.length === 0) {
                return null;
            }

            const metric = result.rows[0];
            this.cache.set(cacheKey, metric, this.CACHE_TTL);
            
            return metric;
        } catch (error) {
            this.logger.error('Error finding metric by ID', { error, id });
            throw error;
        }
    }

    /**
     * Executes optimized metric queries with complex filtering
     */
    async query(query: IMetricQuery): Promise<IMetric[]> {
        try {
            const cacheKey = `query:${JSON.stringify(query)}`;
            const cachedResults = this.cache.get<IMetric[]>(cacheKey);

            if (cachedResults) {
                return cachedResults;
            }

            let sqlQuery = 'SELECT * FROM metrics WHERE timestamp BETWEEN $1 AND $2';
            const values: any[] = [query.startTime, query.endTime];
            let paramIndex = 3;

            if (query.types && query.types.length > 0) {
                sqlQuery += ` AND type = ANY($${paramIndex})`;
                values.push(query.types);
                paramIndex++;
            }

            if (query.tags) {
                Object.entries(query.tags).forEach(([key, value]) => {
                    sqlQuery += ` AND tags->>'${key}' = $${paramIndex}`;
                    values.push(value);
                    paramIndex++;
                });
            }

            if (query.filters) {
                Object.entries(query.filters).forEach(([key, value]) => {
                    sqlQuery += ` AND ${key} = $${paramIndex}`;
                    values.push(value);
                    paramIndex++;
                });
            }

            if (query.groupBy && query.groupBy.length > 0) {
                sqlQuery += ` GROUP BY ${query.groupBy.join(', ')}`;
            }

            sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(query.limit || 100, query.offset || 0);

            const result = await this.pool.query(sqlQuery, values);
            const metrics = result.rows;

            this.cache.set(cacheKey, metrics, this.CACHE_TTL);
            return metrics;
        } catch (error) {
            this.logger.error('Error querying metrics', { error, query });
            throw error;
        }
    }

    /**
     * Performs statistical aggregations on metrics with optimization
     */
    async aggregate(query: IMetricQuery): Promise<IMetricAggregation[]> {
        try {
            const cacheKey = `agg:${JSON.stringify(query)}`;
            const cachedResults = this.cache.get<IMetricAggregation[]>(cacheKey);

            if (cachedResults) {
                return cachedResults;
            }

            const sqlQuery = `
                SELECT 
                    type,
                    AVG(value) as average,
                    MIN(value) as min,
                    MAX(value) as max,
                    SUM(value) as sum,
                    COUNT(*) as count
                FROM metrics
                WHERE timestamp BETWEEN $1 AND $2
                ${query.types?.length ? 'AND type = ANY($3)' : ''}
                GROUP BY type
            `;

            const values = [
                query.startTime,
                query.endTime,
                query.types
            ].filter(Boolean);

            const result = await this.pool.query(sqlQuery, values);
            const aggregations = result.rows.map(row => ({
                type: row.type as MetricType,
                average: parseFloat(row.average),
                min: parseFloat(row.min),
                max: parseFloat(row.max),
                sum: parseFloat(row.sum),
                count: parseInt(row.count)
            }));

            this.cache.set(cacheKey, aggregations, this.CACHE_TTL);
            return aggregations;
        } catch (error) {
            this.logger.error('Error aggregating metrics', { error, query });
            throw error;
        }
    }

    /**
     * Deletes metric with cache invalidation
     */
    async delete(id: string): Promise<boolean> {
        try {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');

                const deleteQuery = 'DELETE FROM metrics WHERE id = $1 RETURNING id';
                const result = await client.query(deleteQuery, [id]);

                await client.query('COMMIT');

                if (result.rows.length > 0) {
                    // Invalidate cache
                    const cacheKey = `metric:${id}`;
                    this.cache.del(cacheKey);
                    return true;
                }

                return false;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            this.logger.error('Error deleting metric', { error, id });
            throw error;
        }
    }
}