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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobQueueHealthIndicator = void 0;
const base_health_indicator_1 = require("../../Health/base/base-health-indicator");
const common_1 = require("@nestjs/common");
const job_queue_manager_1 = require("../services/job-queue.manager");
let JobQueueHealthIndicator = class JobQueueHealthIndicator extends base_health_indicator_1.BaseHealthIndicator {
    constructor(jobQueueManager) {
        super('job-queue');
        this.jobQueueManager = jobQueueManager;
    }
    async performHealthCheck() {
        try {
            const stats = await this.jobQueueManager.getQueueStats();
            const maxQueueLength = 1000;
            const maxFailureRate = 0.1;
            const failureRate = stats.totalJobs > 0
                ? stats.failedJobs / stats.totalJobs
                : 0;
            const isHealthy = stats.queueLength < maxQueueLength
                && failureRate < maxFailureRate;
            const details = {
                queueLength: stats.queueLength,
                activeWorkers: stats.activeWorkers,
                totalJobs: stats.totalJobs,
                completedJobs: stats.completedJobs,
                failedJobs: stats.failedJobs,
                failureRate: Math.round(failureRate * 100) / 100,
                averageProcessingTime: Math.round(stats.averageProcessingTime),
            };
            if (!isHealthy) {
                return this.createUnhealthyResult('Job queue is unhealthy', details);
            }
            return this.createHealthyResult(details);
        }
        catch (error) {
            return this.createUnhealthyResult('Job queue health check failed', {
                error: error.message,
            });
        }
    }
    getDescription() {
        return 'Monitors job queue health including queue length, failure rates, and processing times';
    }
};
exports.JobQueueHealthIndicator = JobQueueHealthIndicator;
exports.JobQueueHealthIndicator = JobQueueHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [job_queue_manager_1.JobQueueManager])
], JobQueueHealthIndicator);
//# sourceMappingURL=job-queue-health.indicator.js.map