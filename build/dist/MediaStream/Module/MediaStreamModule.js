"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MediaStreamImageRESTController_1 = __importDefault(require("../API/Controller/MediaStreamImageRESTController"));
const cache_module_1 = require("../Cache/cache.module");
const config_module_1 = require("../Config/config.module");
const correlation_module_1 = require("../Correlation/correlation.module");
const correlation_middleware_1 = require("../Correlation/middleware/correlation.middleware");
const timing_middleware_1 = require("../Correlation/middleware/timing.middleware");
const correlation_service_1 = require("../Correlation/services/correlation.service");
const MediaStreamExceptionFilter_1 = require("../Error/MediaStreamExceptionFilter");
const health_module_1 = require("../Health/health.module");
const http_module_1 = require("../HTTP/http.module");
const FetchResourceResponseJob_1 = __importDefault(require("../Job/FetchResourceResponseJob"));
const GenerateResourceIdentityFromRequestJob_1 = __importDefault(require("../Job/GenerateResourceIdentityFromRequestJob"));
const StoreResourceResponseToFileJob_1 = __importDefault(require("../Job/StoreResourceResponseToFileJob"));
const WebpImageManipulationJob_1 = __importDefault(require("../Job/WebpImageManipulationJob"));
const metrics_module_1 = require("../Metrics/metrics.module");
const metrics_middleware_1 = require("../Metrics/middleware/metrics.middleware");
const monitoring_module_1 = require("../Monitoring/monitoring.module");
const CacheImageResourceOperation_1 = __importDefault(require("../Operation/CacheImageResourceOperation"));
const queue_module_1 = require("../Queue/queue.module");
const adaptive_rate_limit_guard_1 = require("../RateLimit/guards/adaptive-rate-limit.guard");
const rate_limit_module_1 = require("../RateLimit/rate-limit.module");
const ValidateCacheImageRequestResizeTargetRule_1 = __importDefault(require("../Rule/ValidateCacheImageRequestResizeTargetRule"));
const ValidateCacheImageRequestRule_1 = __importDefault(require("../Rule/ValidateCacheImageRequestRule"));
const storage_module_1 = require("../Storage/storage.module");
const tasks_module_1 = require("../Tasks/tasks.module");
const validation_module_1 = require("../Validation/validation.module");
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const schedule_1 = require("@nestjs/schedule");
const controllers = [MediaStreamImageRESTController_1.default];
const operations = [CacheImageResourceOperation_1.default];
const jobs = [
    GenerateResourceIdentityFromRequestJob_1.default,
    FetchResourceResponseJob_1.default,
    StoreResourceResponseToFileJob_1.default,
    WebpImageManipulationJob_1.default,
];
const rules = [ValidateCacheImageRequestRule_1.default, ValidateCacheImageRequestResizeTargetRule_1.default];
let MediaStreamModule = class MediaStreamModule {
    configure(consumer) {
        consumer
            .apply(correlation_middleware_1.CorrelationMiddleware, timing_middleware_1.TimingMiddleware, metrics_middleware_1.MetricsMiddleware)
            .forRoutes('*');
    }
};
MediaStreamModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            cache_module_1.CacheModule,
            correlation_module_1.CorrelationModule,
            health_module_1.HealthModule,
            http_module_1.HttpModule,
            axios_1.HttpModule.register({}),
            metrics_module_1.MetricsModule,
            monitoring_module_1.MonitoringModule,
            queue_module_1.QueueModule,
            rate_limit_module_1.RateLimitModule,
            storage_module_1.StorageModule,
            tasks_module_1.TasksModule,
            validation_module_1.ValidationModule,
            schedule_1.ScheduleModule.forRoot(),
        ],
        controllers,
        providers: [
            ...jobs,
            ...rules,
            ...operations,
            {
                provide: core_1.APP_FILTER,
                useFactory: (httpAdapterHost, _correlationService) => {
                    return new MediaStreamExceptionFilter_1.MediaStreamExceptionFilter(httpAdapterHost, _correlationService);
                },
                inject: [core_1.HttpAdapterHost, correlation_service_1.CorrelationService],
            },
            {
                provide: core_1.APP_GUARD,
                useClass: adaptive_rate_limit_guard_1.AdaptiveRateLimitGuard,
            },
        ],
    })
], MediaStreamModule);
exports.default = MediaStreamModule;
//# sourceMappingURL=MediaStreamModule.js.map