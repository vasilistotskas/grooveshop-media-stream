import type { HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@microservice/Config/config.service';
import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator';
import { StorageCleanupService } from '../services/storage-cleanup.service';
import { StorageMonitoringService } from '../services/storage-monitoring.service';
export interface StorageHealthDetails {
    totalFiles: number;
    totalSize: string;
    usagePercentage: number;
    oldestFile: string | null;
    newestFile: string | null;
    topFileTypes: Array<{
        extension: string;
        count: number;
    }>;
    cleanupStatus: {
        enabled: boolean;
        lastCleanup: string;
        nextCleanup: string;
    };
    thresholds: {
        warningSize: string;
        criticalSize: string;
        warningFileCount: number;
        criticalFileCount: number;
    };
    recommendations: string[];
}
export declare class StorageHealthIndicator extends BaseHealthIndicator {
    private readonly _configService;
    private readonly storageMonitoring;
    private readonly storageCleanup;
    private readonly _warningThreshold;
    private readonly _criticalThreshold;
    constructor(_configService: ConfigService, storageMonitoring: StorageMonitoringService, storageCleanup: StorageCleanupService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    protected getDescription(): string;
    getStorageAnalysis(): Promise<{
        stats: any;
        thresholds: any;
        evictionCandidates: any[];
        cleanupRecommendations: string[];
    }>;
    private generateRecommendations;
    private generateCleanupRecommendations;
    private formatBytes;
}
