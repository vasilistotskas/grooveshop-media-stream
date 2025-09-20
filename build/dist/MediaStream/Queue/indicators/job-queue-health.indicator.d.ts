import { BaseHealthIndicator } from '@microservice/Health/base/base-health-indicator';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { JobQueueManager } from '../services/job-queue.manager';
export declare class JobQueueHealthIndicator extends BaseHealthIndicator {
    private readonly jobQueueManager;
    constructor(jobQueueManager: JobQueueManager);
    protected performHealthCheck(): Promise<HealthIndicatorResult>;
    protected getDescription(): string;
}
