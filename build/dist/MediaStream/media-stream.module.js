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
const media_stream_image_rest_controller_1 = __importDefault(require("./API/controllers/media-stream-image-rest.controller"));
const cache_module_1 = require("./Cache/cache.module");
const cache_image_resource_operation_1 = __importDefault(require("./Cache/operations/cache-image-resource.operation"));
const media_stream_exception_filter_1 = require("./common/filters/media-stream-exception.filter");
const config_module_1 = require("./Config/config.module");
const correlation_module_1 = require("./Correlation/correlation.module");
const correlation_middleware_1 = require("./Correlation/middleware/correlation.middleware");
const timing_middleware_1 = require("./Correlation/middleware/timing.middleware");
const correlation_service_1 = require("./Correlation/services/correlation.service");
const health_module_1 = require("./Health/health.module");
const http_module_1 = require("./HTTP/http.module");
const metrics_module_1 = require("./Metrics/metrics.module");
const metrics_middleware_1 = require("./Metrics/middleware/metrics.middleware");
const monitoring_module_1 = require("./Monitoring/monitoring.module");
const fetch_resource_response_job_1 = __importDefault(require("./Queue/jobs/fetch-resource-response.job"));
const generate_resource_identity_from_request_job_1 = __importDefault(require("./Queue/jobs/generate-resource-identity-from-request.job"));
const store_resource_response_to_file_job_1 = __importDefault(require("./Queue/jobs/store-resource-response-to-file.job"));
const webp_image_manipulation_job_1 = __importDefault(require("./Queue/jobs/webp-image-manipulation.job"));
const queue_module_1 = require("./Queue/queue.module");
const adaptive_rate_limit_guard_1 = require("./RateLimit/guards/adaptive-rate-limit.guard");
const rate_limit_module_1 = require("./RateLimit/rate-limit.module");
const storage_module_1 = require("./Storage/storage.module");
const tasks_module_1 = require("./Tasks/tasks.module");
const validate_cache_image_request_resize_target_rule_1 = __importDefault(require("./Validation/rules/validate-cache-image-request-resize-target.rule"));
const validate_cache_image_request_rule_1 = __importDefault(require("./Validation/rules/validate-cache-image-request.rule"));
const validation_module_1 = require("./Validation/validation.module");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const schedule_1 = require("@nestjs/schedule");
const controllers = [media_stream_image_rest_controller_1.default];
const operations = [cache_image_resource_operation_1.default];
const jobs = [
    generate_resource_identity_from_request_job_1.default,
    fetch_resource_response_job_1.default,
    store_resource_response_to_file_job_1.default,
    webp_image_manipulation_job_1.default,
];
const rules = [validate_cache_image_request_rule_1.default, validate_cache_image_request_resize_target_rule_1.default];
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
                    return new media_stream_exception_filter_1.MediaStreamExceptionFilter(httpAdapterHost, _correlationService);
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
//# sourceMappingURL=media-stream.module.js.map