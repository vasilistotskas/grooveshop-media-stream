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
import { MonitoringService } from "../services/monitoring.service.js";
export class SystemHealthIndicator extends BaseHealthIndicator {
    constructor(monitoringService){
        super('system'), this.monitoringService = monitoringService;
    }
    async performHealthCheck() {
        try {
            const systemHealth = await this.monitoringService.getSystemHealth();
            const isHealthy = systemHealth.status === 'healthy';
            const details = {
                status: systemHealth.status,
                overallScore: systemHealth.overallScore,
                components: systemHealth.components.map((comp)=>({
                        name: comp.name,
                        status: comp.status,
                        score: comp.score,
                        lastCheck: comp.lastCheck
                    })),
                timestamp: systemHealth.timestamp
            };
            if (!isHealthy) {
                return this.createUnhealthyResult('System is not healthy', details);
            }
            return this.createHealthyResult(details);
        } catch (error) {
            return this.createUnhealthyResult('System health check failed', {
                error: error.message,
                timestamp: Date.now()
            });
        }
    }
    /**
	 * Get detailed system status
	 */ async getDetailedStatus() {
        try {
            const [systemHealth, monitoringStats] = await Promise.all([
                this.monitoringService.getSystemHealth(),
                this.monitoringService.getStats()
            ]);
            return {
                healthy: systemHealth.status === 'healthy',
                systemHealth,
                monitoringStats
            };
        } catch (error) {
            this.logger.error(`Failed to get system status: ${error.message}`, error);
            return {
                healthy: false,
                systemHealth: null,
                monitoringStats: null
            };
        }
    }
    /**
	 * Get component health details
	 */ async getComponentHealth(componentName) {
        const systemHealth = await this.monitoringService.getSystemHealth();
        return systemHealth.components.find((comp)=>comp.name === componentName);
    }
    /**
	 * Get health indicator description
	 */ getDescription() {
        return 'Monitors overall system health including memory, disk, network, and cache components';
    }
}
SystemHealthIndicator = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof MonitoringService === "undefined" ? Object : MonitoringService
    ])
], SystemHealthIndicator);

//# sourceMappingURL=system-health.indicator.js.map