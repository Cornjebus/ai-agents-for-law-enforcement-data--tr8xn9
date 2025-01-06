import { Model, DataTypes, InitOptions } from 'sequelize';
import { UUID } from 'crypto';
import { EventEmitter } from 'events';
import {
    Campaign,
    CampaignStatus,
    CampaignType,
    CampaignMetrics,
    CampaignConfig,
    CampaignBudget,
    CampaignTargeting,
    CampaignAIConfig
} from '../../../common/interfaces/campaign.interface';
import { IMetric, MetricType } from '../../../common/interfaces/metric.interface';

/**
 * Enhanced Sequelize model class for comprehensive campaign management
 * @version 1.0.0
 */
export default class CampaignModel extends Model implements Campaign {
    public id!: UUID;
    public organizationId!: UUID;
    public name!: string;
    public description!: string;
    public status!: CampaignStatus;
    public type!: CampaignType;
    public configuration!: CampaignConfig;
    public metrics!: CampaignMetrics;
    public budget!: CampaignBudget;
    public targeting!: CampaignTargeting;
    public aiConfig!: CampaignAIConfig;
    public startDate!: Date;
    public endDate!: Date | null;
    public createdAt!: Date;
    public updatedAt!: Date;
    public deletedAt!: Date | null;
    public version!: number;

    private eventEmitter: EventEmitter;

    constructor(values?: any, options?: InitOptions) {
        super(values, options);
        this.eventEmitter = new EventEmitter();
        this.initializeMetrics();
        this.version = 1;
    }

    /**
     * Initialize Sequelize model with schema definition
     */
    public static initialize(sequelize: any): void {
        CampaignModel.init({
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true
            },
            organizationId: {
                type: DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'organizations',
                    key: 'id'
                }
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                validate: {
                    len: [3, 100]
                }
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            status: {
                type: DataTypes.ENUM(...Object.values(CampaignStatus)),
                allowNull: false,
                defaultValue: CampaignStatus.DRAFT
            },
            type: {
                type: DataTypes.ENUM(...Object.values(CampaignType)),
                allowNull: false
            },
            configuration: {
                type: DataTypes.JSONB,
                allowNull: false,
                validate: {
                    isValidConfig(value: CampaignConfig) {
                        // Validate configuration schema
                        if (!value.channels || !value.content || !value.schedule) {
                            throw new Error('Invalid campaign configuration');
                        }
                    }
                }
            },
            metrics: {
                type: DataTypes.JSONB,
                allowNull: false
            },
            budget: {
                type: DataTypes.JSONB,
                allowNull: false,
                validate: {
                    isValidBudget(value: CampaignBudget) {
                        if (value.totalBudget <= 0 || value.dailyLimit <= 0) {
                            throw new Error('Invalid budget configuration');
                        }
                    }
                }
            },
            targeting: {
                type: DataTypes.JSONB,
                allowNull: false
            },
            aiConfig: {
                type: DataTypes.JSONB,
                allowNull: false
            },
            startDate: {
                type: DataTypes.DATE,
                allowNull: false
            },
            endDate: {
                type: DataTypes.DATE,
                allowNull: true
            },
            version: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1
            }
        }, {
            sequelize,
            tableName: 'campaigns',
            paranoid: true,
            indexes: [
                { fields: ['organizationId'] },
                { fields: ['status'] },
                { fields: ['type'] },
                { fields: ['startDate', 'endDate'] },
                { fields: ['version'] }
            ]
        });
    }

    /**
     * Validates campaign date constraints
     */
    public async validateDates(): Promise<boolean> {
        if (this.endDate && this.startDate >= this.endDate) {
            throw new Error('End date must be after start date');
        }

        const minDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        if (this.endDate && (this.endDate.getTime() - this.startDate.getTime()) < minDuration) {
            throw new Error('Campaign duration must be at least 24 hours');
        }

        return true;
    }

    /**
     * Updates campaign metrics with optimization triggers
     */
    public async updateMetrics(newMetrics: CampaignMetrics): Promise<void> {
        this.validateMetrics(newMetrics);
        
        const previousMetrics = this.metrics;
        this.metrics = {
            ...this.metrics,
            ...newMetrics,
            performance: this.calculateDerivedMetrics(newMetrics)
        };

        await this.save();

        if (await this.checkOptimizationTriggers(this.metrics)) {
            this.eventEmitter.emit('optimization-needed', {
                campaignId: this.id,
                metrics: this.metrics,
                previousMetrics
            });
        }

        this.eventEmitter.emit('metrics-updated', {
            campaignId: this.id,
            metrics: this.metrics
        });
    }

    /**
     * Checks if campaign metrics have crossed optimization thresholds
     */
    private async checkOptimizationTriggers(metrics: CampaignMetrics): Promise<boolean> {
        const triggers = [
            metrics.engagement.conversionRate < 0.02, // 2% conversion rate threshold
            metrics.quality.leadScore < 70, // Lead quality threshold
            metrics.revenue.roi < 1.5, // ROI threshold
            metrics.engagement.responseRate < 0.15 // Response rate threshold
        ];

        return triggers.some(trigger => trigger);
    }

    /**
     * Updates campaign status with validation
     */
    public async updateStatus(newStatus: CampaignStatus): Promise<void> {
        const validTransitions = {
            [CampaignStatus.DRAFT]: [CampaignStatus.SCHEDULED, CampaignStatus.ACTIVE],
            [CampaignStatus.SCHEDULED]: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED],
            [CampaignStatus.ACTIVE]: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED],
            [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE, CampaignStatus.COMPLETED],
            [CampaignStatus.COMPLETED]: [CampaignStatus.ARCHIVED],
            [CampaignStatus.ARCHIVED]: []
        };

        if (!validTransitions[this.status].includes(newStatus)) {
            throw new Error(`Invalid status transition from ${this.status} to ${newStatus}`);
        }

        const previousStatus = this.status;
        this.status = newStatus;
        this.version += 1;

        await this.save();

        this.eventEmitter.emit('status-changed', {
            campaignId: this.id,
            previousStatus,
            newStatus,
            version: this.version
        });
    }

    /**
     * Initializes default metrics structure
     */
    private initializeMetrics(): void {
        this.metrics = {
            performance: [],
            engagement: {
                impressions: 0,
                interactions: 0,
                conversions: 0,
                conversionRate: 0
            },
            revenue: {
                generated: 0,
                projected: 0,
                roi: 0
            },
            quality: {
                leadScore: 0,
                responseRate: 0,
                satisfactionScore: 0
            }
        };
    }

    /**
     * Validates metrics structure and values
     */
    private validateMetrics(metrics: CampaignMetrics): void {
        if (!metrics.engagement || !metrics.revenue || !metrics.quality) {
            throw new Error('Invalid metrics structure');
        }

        if (metrics.engagement.conversionRate < 0 || metrics.engagement.conversionRate > 1) {
            throw new Error('Invalid conversion rate');
        }
    }

    /**
     * Calculates derived performance metrics
     */
    private calculateDerivedMetrics(metrics: CampaignMetrics): IMetric[] {
        return [
            {
                id: `${this.id}_conversion_rate`,
                name: 'Conversion Rate',
                type: MetricType.CONVERSION_RATE,
                value: metrics.engagement.conversionRate,
                unit: 'PERCENTAGE',
                timestamp: new Date(),
                service: 'campaign',
                environment: process.env.NODE_ENV || 'development',
                metadata: {
                    campaignId: this.id,
                    campaignType: this.type
                },
                tags: {
                    organization: this.organizationId.toString(),
                    campaign: this.id.toString()
                }
            },
            {
                id: `${this.id}_revenue`,
                name: 'Revenue',
                type: MetricType.REVENUE,
                value: metrics.revenue.generated,
                unit: 'DOLLARS',
                timestamp: new Date(),
                service: 'campaign',
                environment: process.env.NODE_ENV || 'development',
                metadata: {
                    campaignId: this.id,
                    campaignType: this.type
                },
                tags: {
                    organization: this.organizationId.toString(),
                    campaign: this.id.toString()
                }
            }
        ];
    }
}