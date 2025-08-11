import { ConfigService } from '@microservice/Config/config.service';
import { OnModuleInit } from '@nestjs/common';
import { IntelligentEvictionService } from './intelligent-eviction.service';
import { StorageMonitoringService } from './storage-monitoring.service';
export interface RetentionPolicy {
    name: string;
    description: string;
    maxAge: number;
    maxSize: number;
    filePattern?: RegExp;
    preserveCount?: number;
    enabled: boolean;
}
export interface CleanupResult {
    filesRemoved: number;
    sizeFreed: number;
    errors: string[];
    policiesApplied: string[];
    duration: number;
    nextCleanup: Date;
}
export interface CleanupConfig {
    enabled: boolean;
    cronSchedule: string;
    policies: RetentionPolicy[];
    dryRun: boolean;
    maxCleanupDuration: number;
}
export declare class StorageCleanupService implements OnModuleInit {
    private readonly _configService;
    private readonly storageMonitoring;
    private readonly intelligentEviction;
    private readonly _logger;
    private readonly storageDirectory;
    private readonly config;
    private lastCleanup;
    private isCleanupRunning;
    constructor(_configService: ConfigService, storageMonitoring: StorageMonitoringService, intelligentEviction: IntelligentEvictionService);
    onModuleInit(): Promise<void>;
    performCleanup(policyNames?: string[], dryRun?: boolean): Promise<CleanupResult>;
    scheduledCleanup(): Promise<void>;
    getCleanupStatus(): {
        enabled: boolean;
        isRunning: boolean;
        lastCleanup: Date;
        nextCleanup: Date;
        policies: RetentionPolicy[];
    };
    updateRetentionPolicy(policy: RetentionPolicy): void;
    removeRetentionPolicy(policyName: string): boolean;
    private applyRetentionPolicy;
    private loadCleanupConfig;
    private getNextCleanupTime;
    private formatBytes;
}
