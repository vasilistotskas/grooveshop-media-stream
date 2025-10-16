function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { BaseHealthIndicator } from "../../Health/base/base-health-indicator.js";
import { Injectable } from "@nestjs/common";
import { JobQueueManager } from "../services/job-queue.manager.js";
export class JobQueueHealthIndicator extends BaseHealthIndicator {
    constructor(jobQueueManager){
        super('job-queue'), this.jobQueueManager = jobQueueManager;
    }
    async performHealthCheck() {
        try {
            const stats = await this.jobQueueManager.getQueueStats();
            const maxQueueLength = 1000;
            const maxFailureRate = 0.1;
            const failureRate = stats.totalJobs > 0 ? stats.failedJobs / stats.totalJobs : 0;
            const isHealthy = stats.queueLength < maxQueueLength && failureRate < maxFailureRate;
            const details = {
                queueLength: stats.queueLength,
                activeWorkers: stats.activeWorkers,
                totalJobs: stats.totalJobs,
                completedJobs: stats.completedJobs,
                failedJobs: stats.failedJobs,
                failureRate: Math.round(failureRate * 100) / 100,
                averageProcessingTime: Math.round(stats.averageProcessingTime)
            };
            if (!isHealthy) {
                return this.createUnhealthyResult('Job queue is unhealthy', details);
            }
            return this.createHealthyResult(details);
        } catch (error) {
            return this.createUnhealthyResult('Job queue health check failed', {
                error: error.message
            });
        }
    }
    getDescription() {
        return 'Monitors job queue health including queue length, failure rates, and processing times';
    }
}
JobQueueHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof JobQueueManager === "undefined" ? Object : JobQueueManager
    ])
], JobQueueHealthIndicator);

//# sourceMappingURL=job-queue-health.indicator.js.map