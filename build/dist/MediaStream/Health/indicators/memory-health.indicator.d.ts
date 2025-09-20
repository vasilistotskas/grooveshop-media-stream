import type { HealthIndicatorResult } from '@nestjs/terminus';
import { BaseHealthIndicator } from '../base/base-health-indicator';
export interface MemoryInfo {
    totalMemory: number;
    freeMemory: number;
    usedMemory: number;
    memoryUsagePercentage: number;
    processMemory: NodeJS.MemoryUsage;
    heapUsagePercentage: number;
}
export declare class MemoryHealthIndicator extends BaseHealthIndicator {
    private readonly _warningThreshold;
    private readonly _criticalThreshold;
    private readonly heapWarningThreshold;
    private readonly heapCriticalThreshold;
    constructor();
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    protected getDescription(): string;
    private getMemoryInfo;
    private formatBytes;
    getCurrentMemoryInfo(): MemoryInfo;
    forceGarbageCollection(): boolean;
}
