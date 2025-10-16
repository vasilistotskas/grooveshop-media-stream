function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TerminusModule } from "@nestjs/terminus";
import { CorrelationModule } from "../Correlation/correlation.module.js";
import { MetricsModule } from "../Metrics/metrics.module.js";
import { MonitoringController } from "./controllers/monitoring.controller.js";
import { AlertingHealthIndicator } from "./indicators/alerting-health.indicator.js";
import { SystemHealthIndicator } from "./indicators/system-health.indicator.js";
import { AlertService } from "./services/alert.service.js";
import { MonitoringService } from "./services/monitoring.service.js";
import { PerformanceMonitoringService } from "./services/performance-monitoring.service.js";
export class MonitoringModule {
}
MonitoringModule = _ts_decorate([
    Module({
        imports: [
            ConfigModule,
            CorrelationModule,
            MetricsModule,
            TerminusModule
        ],
        providers: [
            MonitoringService,
            AlertService,
            PerformanceMonitoringService,
            SystemHealthIndicator,
            AlertingHealthIndicator
        ],
        controllers: [
            MonitoringController
        ],
        exports: [
            MonitoringService,
            AlertService,
            PerformanceMonitoringService
        ]
    })
], MonitoringModule);

//# sourceMappingURL=monitoring.module.js.map