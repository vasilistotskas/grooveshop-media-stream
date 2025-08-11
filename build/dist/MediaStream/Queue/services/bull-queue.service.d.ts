import { OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bull';
import { IJobQueue, Job, JobOptions, JobProcessor, JobStatus, QueueStats } from '../interfaces/job-queue.interface';
export declare class BullQueueService implements IJobQueue, OnModuleDestroy {
    private readonly imageQueue;
    private readonly cacheQueue;
    private readonly _logger;
    private readonly processors;
    constructor(imageQueue: Queue, cacheQueue: Queue);
    add<T = any>(name: string, data: T, options?: JobOptions): Promise<Job<T>>;
    process<T = any>(name: string, processor: JobProcessor<T>): void;
    getStats(): Promise<QueueStats>;
    getJob(jobId: string): Promise<Job | null>;
    removeJob(jobId: string): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    clean(grace: number, status: JobStatus): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private getQueueForJobType;
    private getQueueStats;
    private convertToBullOptions;
    private convertFromBullJob;
}
