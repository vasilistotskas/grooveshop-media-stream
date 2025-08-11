import type { HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@microservice/Config/config.service';
import { BaseHealthIndicator } from '../base/base-health-indicator';
export interface DiskSpaceInfo {
    total: number;
    free: number;
    used: number;
    usedPercentage: number;
    path: string;
}
export declare class DiskSpaceHealthIndicator extends BaseHealthIndicator {
    private readonly _configService;
    private readonly storagePath;
    private readonly _warningThreshold;
    private readonly _criticalThreshold;
    constructor(_configService: ConfigService);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    protected getDescription(): string;
    private getDiskSpaceInfo;
    private getFallbackDiskInfo;
    private formatBytes;
    getCurrentDiskInfo(): Promise<DiskSpaceInfo>;
}
