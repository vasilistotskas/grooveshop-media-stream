"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthModule = void 0;
const cache_module_1 = require("../Cache/cache.module");
const cache_health_indicator_1 = require("../Cache/indicators/cache-health.indicator");
const redis_health_indicator_1 = require("../Cache/indicators/redis-health.indicator");
const config_module_1 = require("../Config/config.module");
const health_controller_1 = require("./controllers/health.controller");
const disk_space_health_indicator_1 = require("./indicators/disk-space-health.indicator");
const memory_health_indicator_1 = require("./indicators/memory-health.indicator");
const http_module_1 = require("../HTTP/http.module");
const http_health_indicator_1 = require("../HTTP/indicators/http-health.indicator");
const alerting_health_indicator_1 = require("../Monitoring/indicators/alerting-health.indicator");
const system_health_indicator_1 = require("../Monitoring/indicators/system-health.indicator");
const monitoring_module_1 = require("../Monitoring/monitoring.module");
const job_queue_health_indicator_1 = require("../Queue/indicators/job-queue-health.indicator");
const queue_module_1 = require("../Queue/queue.module");
const storage_health_indicator_1 = require("../Storage/indicators/storage-health.indicator");
const storage_module_1 = require("../Storage/storage.module");
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
let HealthModule = class HealthModule {
};
exports.HealthModule = HealthModule;
exports.HealthModule = HealthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            terminus_1.TerminusModule,
            config_module_1.ConfigModule,
            http_module_1.HttpModule,
            cache_module_1.CacheModule,
            monitoring_module_1.MonitoringModule,
            queue_module_1.QueueModule,
            storage_module_1.StorageModule,
        ],
        controllers: [health_controller_1.HealthController],
        providers: [
            disk_space_health_indicator_1.DiskSpaceHealthIndicator,
            memory_health_indicator_1.MemoryHealthIndicator,
            http_health_indicator_1.HttpHealthIndicator,
            cache_health_indicator_1.CacheHealthIndicator,
            redis_health_indicator_1.RedisHealthIndicator,
            alerting_health_indicator_1.AlertingHealthIndicator,
            system_health_indicator_1.SystemHealthIndicator,
            job_queue_health_indicator_1.JobQueueHealthIndicator,
            storage_health_indicator_1.StorageHealthIndicator,
        ],
        exports: [
            disk_space_health_indicator_1.DiskSpaceHealthIndicator,
            memory_health_indicator_1.MemoryHealthIndicator,
            http_health_indicator_1.HttpHealthIndicator,
            cache_health_indicator_1.CacheHealthIndicator,
            redis_health_indicator_1.RedisHealthIndicator,
            alerting_health_indicator_1.AlertingHealthIndicator,
            system_health_indicator_1.SystemHealthIndicator,
            job_queue_health_indicator_1.JobQueueHealthIndicator,
            storage_health_indicator_1.StorageHealthIndicator,
        ],
    })
], HealthModule);
//# sourceMappingURL=health.module.js.map