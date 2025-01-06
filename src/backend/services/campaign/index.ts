/**
 * Main entry point for the campaign service module that exports campaign management functionality
 * Provides centralized access to campaign-related operations for the autonomous revenue generation platform.
 * @version 1.0.0
 */

import { container } from 'tsyringe'; // v4.8.0
import { CampaignController } from './controllers/campaign.controller';
import { OptimizationService } from './services/optimization.service';
import { TargetingService } from './services/targeting.service';

// Performance monitoring thresholds
const PERFORMANCE_THRESHOLD_MS = 200;
const INITIALIZATION_RETRY_ATTEMPTS = 3;
const MEMORY_MONITOR_INTERVAL_MS = 60000;

/**
 * Registers campaign service dependencies in the DI container
 * with proper error handling and performance monitoring
 */
function registerDependencies(): void {
    try {
        // Register CampaignController as singleton
        container.registerSingleton(CampaignController);

        // Register OptimizationService with memory management
        container.registerSingleton(OptimizationService, {
            lifecycle: 'singleton',
            afterResolution: (instance: OptimizationService) => {
                // Monitor optimization service memory usage
                setInterval(() => {
                    const memoryUsage = process.memoryUsage();
                    if (memoryUsage.heapUsed > 1024 * 1024 * 512) { // 512MB threshold
                        console.warn('High memory usage in OptimizationService');
                    }
                }, MEMORY_MONITOR_INTERVAL_MS);
                return instance;
            }
        });

        // Register TargetingService with lifecycle monitoring
        container.registerSingleton(TargetingService, {
            lifecycle: 'singleton',
            beforeResolution: () => {
                console.log('Initializing TargetingService...');
            },
            afterResolution: (instance: TargetingService) => {
                console.log('TargetingService initialized successfully');
                return instance;
            }
        });

    } catch (error) {
        console.error('Failed to register campaign service dependencies:', error);
        throw error;
    }
}

// Initialize dependencies
registerDependencies();

// Export campaign management functionality
export {
    // Campaign controller for route handling
    CampaignController,
    createCampaign,
    getCampaign,
    updateCampaign,
    deleteCampaign,
    optimizeCampaign,
    updateTargeting
} from './controllers/campaign.controller';

// Export optimization service for campaign performance tuning
export {
    OptimizationService,
    optimizeCampaign,
    analyzePerformance,
    applyOptimizations,
    scheduleOptimization
} from './services/optimization.service';

// Export targeting service for campaign audience management
export {
    TargetingService,
    analyzeCampaignTargeting,
    updateTargetingCriteria,
    qualifyLead,
    optimizeTargeting
} from './services/targeting.service';

// Export campaign-related interfaces and types
export {
    Campaign,
    CampaignStatus,
    CampaignType,
    CampaignConfig,
    CampaignTargeting,
    CampaignAIConfig,
    CampaignMetrics,
    CampaignBudget
} from '../../common/interfaces/campaign.interface';