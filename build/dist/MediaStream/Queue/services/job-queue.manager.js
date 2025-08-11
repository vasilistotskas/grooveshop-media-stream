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
var JobQueueManager_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobQueueManager = void 0;
const common_1 = require("@nestjs/common");
const correlation_service_1 = require("../../Correlation/services/correlation.service");
const cache_operations_processor_1 = require("../processors/cache-operations.processor");
const image_processing_processor_1 = require("../processors/image-processing.processor");
const job_types_1 = require("../types/job.types");
const bull_queue_service_1 = require("./bull-queue.service");
let JobQueueManager = JobQueueManager_1 = class JobQueueManager {
    constructor(queueService, imageProcessor, cacheProcessor, _correlationService) {
        this.queueService = queueService;
        this.imageProcessor = imageProcessor;
        this.cacheProcessor = cacheProcessor;
        this._correlationService = _correlationService;
        this._logger = new common_1.Logger(JobQueueManager_1.name);
        this.metrics = {
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            processingTimes: [],
        };
    }
    async onModuleInit() {
        this.setupJobProcessors();
        this._logger.log('Job queue manager initialized');
    }
    async addImageProcessingJob(data, options = {}) {
        const correlationId = this._correlationService.getCorrelationId();
        const jobData = {
            ...data,
            correlationId,
        };
        const jobOptions = {
            priority: data.priority || job_types_1.JobPriority.NORMAL,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 10,
            removeOnFail: 5,
            ...options,
        };
        this.metrics.totalJobs++;
        this._logger.debug(`Adding image processing job for URL: ${data.imageUrl}`);
        return await this.queueService.add(job_types_1.JobType.IMAGE_PROCESSING, jobData, jobOptions);
    }
    async addCacheWarmingJob(data, options = {}) {
        const correlationId = this._correlationService.getCorrelationId();
        const jobData = {
            ...data,
            correlationId,
        };
        const jobOptions = {
            priority: data.priority || job_types_1.JobPriority.LOW,
            attempts: 2,
            backoff: { type: 'fixed', delay: 5000 },
            removeOnComplete: 5,
            removeOnFail: 3,
            ...options,
        };
        this.metrics.totalJobs++;
        this._logger.debug(`Adding cache warming job for ${data.imageUrls.length} images`);
        return await this.queueService.add(job_types_1.JobType.CACHE_WARMING, jobData, jobOptions);
    }
    async addCacheCleanupJob(data, options = {}) {
        const correlationId = this._correlationService.getCorrelationId();
        const jobData = {
            ...data,
            correlationId,
        };
        const jobOptions = {
            priority: data.priority || job_types_1.JobPriority.LOW,
            attempts: 1,
            removeOnComplete: 3,
            removeOnFail: 1,
            ...options,
        };
        this.metrics.totalJobs++;
        this._logger.debug('Adding cache cleanup job');
        return await this.queueService.add(job_types_1.JobType.CACHE_CLEANUP, jobData, jobOptions);
    }
    async getJobById(jobId) {
        return await this.queueService.getJob(jobId);
    }
    async removeJob(jobId) {
        await this.queueService.removeJob(jobId);
    }
    async pauseQueues() {
        await this.queueService.pause();
        this._logger.log('All queues paused');
    }
    async resumeQueues() {
        await this.queueService.resume();
        this._logger.log('All queues resumed');
    }
    async getQueueStats() {
        const queueStats = await this.queueService.getStats();
        const averageProcessingTime = this.metrics.processingTimes.length > 0
            ? this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length
            : 0;
        return {
            totalJobs: this.metrics.totalJobs,
            completedJobs: this.metrics.completedJobs,
            failedJobs: this.metrics.failedJobs,
            averageProcessingTime,
            queueLength: queueStats.waiting + queueStats.delayed,
            activeWorkers: queueStats.active,
        };
    }
    async cleanCompletedJobs(olderThan = 24 * 60 * 60 * 1000) {
        await this.queueService.clean(olderThan, 'completed');
        this._logger.debug(`Cleaned completed jobs older than ${olderThan}ms`);
    }
    async cleanFailedJobs(olderThan = 7 * 24 * 60 * 60 * 1000) {
        await this.queueService.clean(olderThan, 'failed');
        this._logger.debug(`Cleaned failed jobs older than ${olderThan}ms`);
    }
    setupJobProcessors() {
        this.queueService.process(job_types_1.JobType.IMAGE_PROCESSING, async (job) => {
            const startTime = Date.now();
            try {
                const result = await this.imageProcessor.process(job);
                const processingTime = Date.now() - startTime;
                this.updateMetrics(true, processingTime);
                return result;
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                this.updateMetrics(false, processingTime);
                throw error;
            }
        });
        this.queueService.process(job_types_1.JobType.CACHE_WARMING, async (job) => {
            const startTime = Date.now();
            try {
                const result = await this.cacheProcessor.processCacheWarming(job);
                const processingTime = Date.now() - startTime;
                this.updateMetrics(true, processingTime);
                return result;
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                this.updateMetrics(false, processingTime);
                throw error;
            }
        });
        this.queueService.process(job_types_1.JobType.CACHE_CLEANUP, async (job) => {
            const startTime = Date.now();
            try {
                const result = await this.cacheProcessor.processCacheCleanup(job);
                const processingTime = Date.now() - startTime;
                this.updateMetrics(true, processingTime);
                return result;
            }
            catch (error) {
                const processingTime = Date.now() - startTime;
                this.updateMetrics(false, processingTime);
                throw error;
            }
        });
        this._logger.debug('Job processors configured');
    }
    updateMetrics(success, processingTime) {
        if (success) {
            this.metrics.completedJobs++;
        }
        else {
            this.metrics.failedJobs++;
        }
        this.metrics.processingTimes.push(processingTime);
        if (this.metrics.processingTimes.length > 1000) {
            this.metrics.processingTimes = this.metrics.processingTimes.slice(-1000);
        }
    }
};
exports.JobQueueManager = JobQueueManager;
exports.JobQueueManager = JobQueueManager = JobQueueManager_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [bull_queue_service_1.BullQueueService,
        image_processing_processor_1.ImageProcessingProcessor,
        cache_operations_processor_1.CacheOperationsProcessor,
        correlation_service_1.CorrelationService])
], JobQueueManager);
//# sourceMappingURL=job-queue.manager.js.map