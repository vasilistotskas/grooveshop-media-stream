"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageModule = void 0;
const config_module_1 = require("../Config/config.module");
const correlation_module_1 = require("../Correlation/correlation.module");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const storage_health_indicator_1 = require("./indicators/storage-health.indicator");
const intelligent_eviction_service_1 = require("./services/intelligent-eviction.service");
const storage_cleanup_service_1 = require("./services/storage-cleanup.service");
const storage_monitoring_service_1 = require("./services/storage-monitoring.service");
const storage_optimization_service_1 = require("./services/storage-optimization.service");
let StorageModule = class StorageModule {
};
exports.StorageModule = StorageModule;
exports.StorageModule = StorageModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            correlation_module_1.CorrelationModule,
            schedule_1.ScheduleModule.forRoot(),
        ],
        providers: [
            storage_monitoring_service_1.StorageMonitoringService,
            intelligent_eviction_service_1.IntelligentEvictionService,
            storage_cleanup_service_1.StorageCleanupService,
            storage_optimization_service_1.StorageOptimizationService,
            storage_health_indicator_1.StorageHealthIndicator,
        ],
        exports: [
            storage_monitoring_service_1.StorageMonitoringService,
            intelligent_eviction_service_1.IntelligentEvictionService,
            storage_cleanup_service_1.StorageCleanupService,
            storage_optimization_service_1.StorageOptimizationService,
            storage_health_indicator_1.StorageHealthIndicator,
        ],
    })
], StorageModule);
//# sourceMappingURL=storage.module.js.map