"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const terminus_1 = require("@nestjs/terminus");
const correlation_module_1 = require("../Correlation/correlation.module");
const metrics_module_1 = require("../Metrics/metrics.module");
const monitoring_controller_1 = require("./controllers/monitoring.controller");
const alerting_health_indicator_1 = require("./indicators/alerting-health.indicator");
const system_health_indicator_1 = require("./indicators/system-health.indicator");
const alert_service_1 = require("./services/alert.service");
const monitoring_service_1 = require("./services/monitoring.service");
const performance_monitoring_service_1 = require("./services/performance-monitoring.service");
let MonitoringModule = class MonitoringModule {
};
exports.MonitoringModule = MonitoringModule;
exports.MonitoringModule = MonitoringModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            correlation_module_1.CorrelationModule,
            metrics_module_1.MetricsModule,
            terminus_1.TerminusModule,
        ],
        providers: [
            monitoring_service_1.MonitoringService,
            alert_service_1.AlertService,
            performance_monitoring_service_1.PerformanceMonitoringService,
            system_health_indicator_1.SystemHealthIndicator,
            alerting_health_indicator_1.AlertingHealthIndicator,
        ],
        controllers: [
            monitoring_controller_1.MonitoringController,
        ],
        exports: [
            monitoring_service_1.MonitoringService,
            alert_service_1.AlertService,
            performance_monitoring_service_1.PerformanceMonitoringService,
        ],
    })
], MonitoringModule);
//# sourceMappingURL=monitoring.module.js.map