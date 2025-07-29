import { ConfigService } from '@microservice/Config/config.service';
import { OnModuleInit } from '@nestjs/common';
import { AccessPattern, StorageMonitoringService } from './storage-monitoring.service';
export interface OptimizationStrategy {
    name: string;
    description: string;
    execute: (files: AccessPattern[]) => Promise<OptimizationResult>;
}
export interface OptimizationResult {
    filesOptimized: number;
    sizeReduced: number;
    errors: string[];
    strategy: string;
    duration: number;
}
export interface OptimizationConfig {
    enabled: boolean;
    strategies: string[];
    popularFileThreshold: number;
    compressionLevel: number;
    createBackups: boolean;
    maxOptimizationTime: number;
}
export interface FileOptimization {
    originalPath: string;
    optimizedPath: string;
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
    strategy: string;
}
export declare class StorageOptimizationService implements OnModuleInit {
    private readonly configService;
    private readonly storageMonitoring;
    private readonly logger;
    private readonly storageDirectory;
    private readonly config;
    private readonly strategies;
    private optimizationHistory;
    private isOptimizationRunning;
    constructor(configService: ConfigService, storageMonitoring: StorageMonitoringService);
    onModuleInit(): Promise<void>;
    optimizeFrequentlyAccessedFiles(): Promise<OptimizationResult>;
    scheduledOptimization(): Promise<void>;
    getOptimizationStats(): {
        enabled: boolean;
        isRunning: boolean;
        totalOptimizations: number;
        totalSizeSaved: number;
        averageCompressionRatio: number;
        strategies: string[];
    };
    getFileOptimizationHistory(filename: string): FileOptimization | null;
    private initializeStrategies;
    private compressFile;
    private findDuplicateFiles;
    private deduplicateFiles;
    private formatBytes;
}
