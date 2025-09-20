"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BullQueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullQueueService = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const job_types_1 = require("../types/job.types");
let BullQueueService = BullQueueService_1 = class BullQueueService {
    constructor(imageQueue, cacheQueue) {
        this.imageQueue = imageQueue;
        this.cacheQueue = cacheQueue;
        this._logger = new common_1.Logger(BullQueueService_1.name);
        this.processors = new Map();
    }
    async add(name, data, options = {}) {
        try {
            const queue = this.getQueueForJobType(name);
            const bullOptions = this.convertToBullOptions(options);
            const bullJob = await queue.add(name, data, bullOptions);
            this._logger.debug(`Job ${name} added to queue with ID: ${bullJob.id}`);
            return this.convertFromBullJob(bullJob);
        }
        catch (error) {
            this._logger.error(`Failed to add job ${name} to queue:`, error);
            throw error;
        }
    }
    process(name, processor) {
        this.processors.set(name, processor);
        const queue = this.getQueueForJobType(name);
        queue.process(name, async (bullJob) => {
            const job = this.convertFromBullJob(bullJob);
            try {
                this._logger.debug(`Processing job ${name} with ID: ${job.id}`);
                const result = await processor(job);
                this._logger.debug(`Job ${name} completed successfully`);
                return result;
            }
            catch (error) {
                this._logger.error(`Job ${name} failed:`, error);
                throw error;
            }
        });
    }
    async getStats() {
        try {
            const [imageStats, cacheStats] = await Promise.all([
                this.getQueueStats(this.imageQueue),
                this.getQueueStats(this.cacheQueue),
            ]);
            return {
                waiting: imageStats.waiting + cacheStats.waiting,
                active: imageStats.active + cacheStats.active,
                completed: imageStats.completed + cacheStats.completed,
                failed: imageStats.failed + cacheStats.failed,
                delayed: imageStats.delayed + cacheStats.delayed,
                paused: imageStats.paused && cacheStats.paused,
            };
        }
        catch (error) {
            this._logger.error('Failed to get queue stats:', error);
            throw error;
        }
    }
    async getJob(jobId) {
        try {
            const [imageJob, cacheJob] = await Promise.all([
                this.imageQueue.getJob(jobId),
                this.cacheQueue.getJob(jobId),
            ]);
            const bullJob = imageJob || cacheJob;
            return bullJob ? this.convertFromBullJob(bullJob) : null;
        }
        catch (error) {
            this._logger.error(`Failed to get job ${jobId}:`, error);
            return null;
        }
    }
    async removeJob(jobId) {
        try {
            const job = await this.getJob(jobId);
            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }
            const queue = this.getQueueForJobType(job.name);
            const bullJob = await queue.getJob(jobId);
            if (bullJob) {
                await bullJob.remove();
                this._logger.debug(`Job ${jobId} removed from queue`);
            }
        }
        catch (error) {
            this._logger.error(`Failed to remove job ${jobId}:`, error);
            throw error;
        }
    }
    async pause() {
        try {
            await Promise.all([
                this.imageQueue.pause(),
                this.cacheQueue.pause(),
            ]);
            this._logger.log('All queues paused');
        }
        catch (error) {
            this._logger.error('Failed to pause queues:', error);
            throw error;
        }
    }
    async resume() {
        try {
            await Promise.all([
                this.imageQueue.resume(),
                this.cacheQueue.resume(),
            ]);
            this._logger.log('All queues resumed');
        }
        catch (error) {
            this._logger.error('Failed to resume queues:', error);
            throw error;
        }
    }
    async clean(grace, status) {
        try {
            const bullStatus = status;
            await Promise.all([
                this.imageQueue.clean(grace, bullStatus),
                this.cacheQueue.clean(grace, bullStatus),
            ]);
            this._logger.debug(`Cleaned ${status} jobs older than ${grace}ms`);
        }
        catch (error) {
            this._logger.error(`Failed to clean ${status} jobs:`, error);
            throw error;
        }
    }
    async onModuleDestroy() {
        try {
            await Promise.all([
                this.imageQueue.close(),
                this.cacheQueue.close(),
            ]);
            this._logger.log('Queue connections closed');
        }
        catch (error) {
            this._logger.error('Failed to close queue connections:', error);
        }
    }
    getQueueForJobType(jobType) {
        if (jobType === job_types_1.JobType.IMAGE_PROCESSING) {
            return this.imageQueue;
        }
        return this.cacheQueue;
    }
    async getQueueStats(queue) {
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed(),
            queue.getDelayed(),
            queue.isPaused(),
        ]);
        return {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
            paused,
        };
    }
    convertToBullOptions(options) {
        return {
            priority: options.priority,
            delay: options.delay,
            attempts: options.attempts || 3,
            repeat: options.repeat,
            backoff: options.backoff || { type: 'exponential', delay: 2000 },
            lifo: options.lifo,
            timeout: options.timeout || 30000,
            removeOnComplete: options.removeOnComplete ?? 10,
            removeOnFail: options.removeOnFail ?? 5,
            jobId: options.jobId,
        };
    }
    convertFromBullJob(bullJob) {
        return {
            id: bullJob.id.toString(),
            name: bullJob.name,
            data: bullJob.data,
            opts: bullJob.opts,
            progress: bullJob.progress(),
            delay: bullJob.delay || 0,
            timestamp: bullJob.timestamp,
            attemptsMade: bullJob.attemptsMade,
            failedReason: bullJob.failedReason,
            stacktrace: bullJob.stacktrace,
            returnvalue: bullJob.returnvalue,
            finishedOn: bullJob.finishedOn,
            processedOn: bullJob.processedOn,
        };
    }
};
exports.BullQueueService = BullQueueService;
exports.BullQueueService = BullQueueService = BullQueueService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bull_1.InjectQueue)('image-processing')),
    __param(1, (0, bull_1.InjectQueue)('cache-operations')),
    __metadata("design:paramtypes", [Object, Object])
], BullQueueService);
//# sourceMappingURL=bull-queue.service.js.map