function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { CacheModule } from "../Cache/cache.module.js";
import { CacheHealthIndicator } from "../Cache/indicators/cache-health.indicator.js";
import { RedisHealthIndicator } from "../Cache/indicators/redis-health.indicator.js";
import { ConfigModule } from "../Config/config.module.js";
import { HealthController } from "./controllers/health.controller.js";
import { DiskSpaceHealthIndicator } from "./indicators/disk-space-health.indicator.js";
import { MemoryHealthIndicator } from "./indicators/memory-health.indicator.js";
import { HttpModule } from "../HTTP/http.module.js";
import { HttpHealthIndicator } from "../HTTP/indicators/http-health.indicator.js";
import { AlertingHealthIndicator } from "../Monitoring/indicators/alerting-health.indicator.js";
import { SystemHealthIndicator } from "../Monitoring/indicators/system-health.indicator.js";
import { MonitoringModule } from "../Monitoring/monitoring.module.js";
import { JobQueueHealthIndicator } from "../Queue/indicators/job-queue-health.indicator.js";
import { QueueModule } from "../Queue/queue.module.js";
import { StorageHealthIndicator } from "../Storage/indicators/storage-health.indicator.js";
import { StorageModule } from "../Storage/storage.module.js";
import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
export class HealthModule {
}
HealthModule = _ts_decorate([
    Module({
        imports: [
            TerminusModule,
            ConfigModule,
            HttpModule,
            CacheModule,
            MonitoringModule,
            QueueModule,
            StorageModule
        ],
        controllers: [
            HealthController
        ],
        providers: [
            DiskSpaceHealthIndicator,
            MemoryHealthIndicator,
            HttpHealthIndicator,
            CacheHealthIndicator,
            RedisHealthIndicator,
            AlertingHealthIndicator,
            SystemHealthIndicator,
            JobQueueHealthIndicator,
            StorageHealthIndicator
        ],
        exports: [
            DiskSpaceHealthIndicator,
            MemoryHealthIndicator,
            HttpHealthIndicator,
            CacheHealthIndicator,
            RedisHealthIndicator,
            AlertingHealthIndicator,
            SystemHealthIndicator,
            JobQueueHealthIndicator,
            StorageHealthIndicator
        ]
    })
], HealthModule);

//# sourceMappingURL=health.module.js.map