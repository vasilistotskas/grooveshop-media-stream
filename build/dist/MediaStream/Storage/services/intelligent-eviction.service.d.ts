import { ConfigService } from '@microservice/Config/config.service';
import { AccessPattern, StorageMonitoringService } from './storage-monitoring.service';
export interface EvictionStrategy {
    name: string;
    description: string;
    execute: (candidates: AccessPattern[], targetSize: number) => Promise<AccessPattern[]>;
}
export interface EvictionResult {
    filesEvicted: number;
    sizeFreed: number;
    errors: string[];
    strategy: string;
    duration: number;
}
export interface EvictionConfig {
    strategy: 'lru' | 'lfu' | 'size-based' | 'age-based' | 'intelligent';
    aggressiveness: 'conservative' | 'moderate' | 'aggressive';
    preservePopular: boolean;
    minAccessCount: number;
    maxFileAge: number;
}
export declare class IntelligentEvictionService {
    private readonly _configService;
    private readonly storageMonitoring;
    private readonly storageDirectory;
    private readonly config;
    private readonly strategies;
    constructor(_configService: ConfigService, storageMonitoring: StorageMonitoringService);
    performEviction(targetSize?: number): Promise<EvictionResult>;
    performThresholdBasedEviction(): Promise<EvictionResult>;
    getEvictionRecommendations(targetSize?: number): Promise<{
        candidates: AccessPattern[];
        totalSize: number;
        strategy: string;
        reasoning: string[];
    }>;
    private initializeStrategies;
    private evictFiles;
    private calculateFileCount;
    private getAggressivenessMultiplier;
    private generateEvictionReasoning;
    private formatBytes;
}
