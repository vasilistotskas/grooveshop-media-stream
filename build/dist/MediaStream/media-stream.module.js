function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import MediaStreamImageRESTController from "./API/controllers/media-stream-image-rest.controller.js";
import { CacheModule } from "./Cache/cache.module.js";
import CacheImageResourceOperation from "./Cache/operations/cache-image-resource.operation.js";
import { MediaStreamExceptionFilter } from "./common/filters/media-stream-exception.filter.js";
import { ConfigModule } from "./Config/config.module.js";
import { CorrelationModule } from "./Correlation/correlation.module.js";
import { CorrelationMiddleware } from "./Correlation/middleware/correlation.middleware.js";
import { TimingMiddleware } from "./Correlation/middleware/timing.middleware.js";
import { CorrelationService } from "./Correlation/services/correlation.service.js";
import { HealthModule } from "./Health/health.module.js";
import { HttpModule } from "./HTTP/http.module.js";
import { MetricsModule } from "./Metrics/metrics.module.js";
import { MetricsMiddleware } from "./Metrics/middleware/metrics.middleware.js";
import { MonitoringModule } from "./Monitoring/monitoring.module.js";
import FetchResourceResponseJob from "./Queue/jobs/fetch-resource-response.job.js";
import GenerateResourceIdentityFromRequestJob from "./Queue/jobs/generate-resource-identity-from-request.job.js";
import StoreResourceResponseToFileJob from "./Queue/jobs/store-resource-response-to-file.job.js";
import WebpImageManipulationJob from "./Queue/jobs/webp-image-manipulation.job.js";
import { QueueModule } from "./Queue/queue.module.js";
import { AdaptiveRateLimitGuard } from "./RateLimit/guards/adaptive-rate-limit.guard.js";
import { RateLimitModule } from "./RateLimit/rate-limit.module.js";
import { StorageModule } from "./Storage/storage.module.js";
import { TasksModule } from "./Tasks/tasks.module.js";
import ValidateCacheImageRequestResizeTargetRule from "./Validation/rules/validate-cache-image-request-resize-target.rule.js";
import ValidateCacheImageRequestRule from "./Validation/rules/validate-cache-image-request.rule.js";
import { ValidationModule } from "./Validation/validation.module.js";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
const controllers = [
    MediaStreamImageRESTController
];
const operations = [
    CacheImageResourceOperation
];
const jobs = [
    GenerateResourceIdentityFromRequestJob,
    FetchResourceResponseJob,
    StoreResourceResponseToFileJob,
    WebpImageManipulationJob
];
const rules = [
    ValidateCacheImageRequestRule,
    ValidateCacheImageRequestResizeTargetRule
];
export default class MediaStreamModule {
    configure(consumer) {
        consumer.apply(CorrelationMiddleware, TimingMiddleware, MetricsMiddleware).forRoutes('*');
    }
}
MediaStreamModule = _ts_decorate([
    Module({
        imports: [
            ConfigModule,
            CacheModule,
            CorrelationModule,
            HealthModule,
            HttpModule,
            MetricsModule,
            MonitoringModule,
            QueueModule,
            RateLimitModule,
            StorageModule,
            TasksModule,
            ValidationModule,
            ScheduleModule.forRoot()
        ],
        controllers,
        providers: [
            ...jobs,
            ...rules,
            ...operations,
            {
                provide: APP_FILTER,
                useFactory: (httpAdapterHost, _correlationService)=>{
                    return new MediaStreamExceptionFilter(httpAdapterHost, _correlationService);
                },
                inject: [
                    HttpAdapterHost,
                    CorrelationService
                ]
            },
            {
                provide: APP_GUARD,
                useClass: AdaptiveRateLimitGuard
            }
        ]
    })
], MediaStreamModule);

//# sourceMappingURL=media-stream.module.js.map