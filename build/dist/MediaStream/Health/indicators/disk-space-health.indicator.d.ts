import { ConfigService } from '@microservice/Config/config.service';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { BaseHealthIndicator } from '../base/base-health-indicator';
export interface DiskSpaceInfo {
    total: number;
    free: number;
    used: number;
    usedPercentage: number;
    path: string;
}
export declare class DiskSpaceHealthIndicator extends BaseHealthIndicator {
    private readonly configService;
    private readonly storagePath;
    private readonly warningThreshold;
    private readonly criticalThreshold;
    constructor(configService: ConfigService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    protected getDescription(): string;
    private getDiskSpaceInfo;
    private getFallbackDiskInfo;
    private formatBytes;
    getCurrentDiskInfo(): Promise<DiskSpaceInfo>;
}
