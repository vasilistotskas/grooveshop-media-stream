export interface IJobQueue {
    add: <T = any>(name: string, data: T, options?: JobOptions) => Promise<Job<T>>;
    process: <T = any>(name: string, processor: JobProcessor<T>) => void;
    getStats: () => Promise<QueueStats>;
    getJob: (jobId: string) => Promise<Job | null>;
    removeJob: (jobId: string) => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    clean: (grace: number, status: JobStatus) => Promise<void>;
}
export interface Job<T = any> {
    id: string;
    name: string;
    data: T;
    opts: JobOptions;
    progress: number;
    delay: number;
    timestamp: number;
    attemptsMade: number;
    failedReason?: string;
    stacktrace?: string[];
    returnvalue?: any;
    finishedOn?: number;
    processedOn?: number;
}
export interface JobOptions {
    priority?: number;
    delay?: number;
    attempts?: number;
    repeat?: RepeatOptions;
    backoff?: BackoffOptions;
    lifo?: boolean;
    timeout?: number;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    jobId?: string;
}
export interface RepeatOptions {
    cron?: string;
    tz?: string;
    startDate?: Date | string | number;
    endDate?: Date | string | number;
    limit?: number;
    every?: number;
    count?: number;
}
export interface BackoffOptions {
    type: 'fixed' | 'exponential';
    delay?: number;
}
export interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
}
export type JobStatus = 'completed' | 'waiting' | 'active' | 'delayed' | 'failed' | 'paused';
export type JobProcessor<T = any> = (job: Job<T>) => Promise<any>;
export interface JobEvent {
    jobId: string;
    event: 'completed' | 'failed' | 'progress' | 'stalled';
    data?: any;
    error?: Error;
}
