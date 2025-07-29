import { ConfigService } from '@microservice/Config/config.service';
import { OnModuleInit } from '@nestjs/common';
export interface StorageStats {
    totalFiles: number;
    totalSize: number;
    averageFileSize: number;
    oldestFile: Date | null;
    newestFile: Date | null;
    fileTypes: Record<string, number>;
    accessPatterns: AccessPattern[];
}
export interface AccessPattern {
    file: string;
    lastAccessed: Date;
    accessCount: number;
    size: number;
    extension: string;
}
export interface StorageThresholds {
    warningSize: number;
    criticalSize: number;
    warningFileCount: number;
    criticalFileCount: number;
    maxFileAge: number;
}
export declare class StorageMonitoringService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    private readonly storageDirectory;
    private readonly thresholds;
    private accessPatterns;
    private lastScanTime;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    getStorageStats(): Promise<StorageStats>;
    checkThresholds(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        issues: string[];
        stats: StorageStats;
    }>;
    getEvictionCandidates(targetSize?: number): Promise<AccessPattern[]>;
    recordFileAccess(filename: string): void;
    scanStorageDirectory(): Promise<void>;
    getLastScanTime(): Date;
    private updateAccessPattern;
    private calculateEvictionScore;
    private formatBytes;
    private ensureStorageDirectory;
}
