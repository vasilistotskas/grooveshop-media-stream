function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { ConfigModule } from "../Config/config.module.js";
import { CorrelationModule } from "../Correlation/correlation.module.js";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { StorageHealthIndicator } from "./indicators/storage-health.indicator.js";
import { IntelligentEvictionService } from "./services/intelligent-eviction.service.js";
import { StorageCleanupService } from "./services/storage-cleanup.service.js";
import { StorageMonitoringService } from "./services/storage-monitoring.service.js";
import { StorageOptimizationService } from "./services/storage-optimization.service.js";
export class StorageModule {
}
StorageModule = _ts_decorate([
    Module({
        imports: [
            ConfigModule,
            CorrelationModule,
            ScheduleModule.forRoot()
        ],
        providers: [
            StorageMonitoringService,
            IntelligentEvictionService,
            StorageCleanupService,
            StorageOptimizationService,
            StorageHealthIndicator
        ],
        exports: [
            StorageMonitoringService,
            IntelligentEvictionService,
            StorageCleanupService,
            StorageOptimizationService,
            StorageHealthIndicator
        ]
    })
], StorageModule);

//# sourceMappingURL=storage.module.js.map