"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const terminus_1 = require("@nestjs/terminus");
const cache_module_1 = require("../Cache/cache.module");
const correlation_module_1 = require("../Correlation/correlation.module");
const http_module_1 = require("../HTTP/http.module");
const job_queue_health_indicator_1 = require("./indicators/job-queue-health.indicator");
const cache_operations_processor_1 = require("./processors/cache-operations.processor");
const image_processing_processor_1 = require("./processors/image-processing.processor");
const bull_queue_service_1 = require("./services/bull-queue.service");
const job_queue_manager_1 = require("./services/job-queue.manager");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => ({
                    redis: {
                        host: configService.get('REDIS_HOST', 'localhost'),
                        port: configService.get('REDIS_PORT', 6379),
                        password: configService.get('REDIS_PASSWORD'),
                        db: configService.get('REDIS_DB', 0),
                        retryDelayOnFailover: 100,
                        enableReadyCheck: false,
                        maxRetriesPerRequest: 3,
                    },
                    defaultJobOptions: {
                        removeOnComplete: 10,
                        removeOnFail: 5,
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 2000,
                        },
                    },
                }),
                inject: [config_1.ConfigService],
            }),
            bull_1.BullModule.registerQueue({
                name: 'image-processing',
                defaultJobOptions: {
                    removeOnComplete: 10,
                    removeOnFail: 5,
                    attempts: 3,
                },
            }, {
                name: 'cache-operations',
                defaultJobOptions: {
                    removeOnComplete: 5,
                    removeOnFail: 3,
                    attempts: 2,
                },
            }),
            correlation_module_1.CorrelationModule,
            http_module_1.HttpModule,
            cache_module_1.CacheModule,
            terminus_1.TerminusModule,
        ],
        providers: [
            bull_queue_service_1.BullQueueService,
            job_queue_manager_1.JobQueueManager,
            image_processing_processor_1.ImageProcessingProcessor,
            cache_operations_processor_1.CacheOperationsProcessor,
            job_queue_health_indicator_1.JobQueueHealthIndicator,
        ],
        exports: [
            job_queue_manager_1.JobQueueManager,
            job_queue_health_indicator_1.JobQueueHealthIndicator,
        ],
    })
], QueueModule);
//# sourceMappingURL=queue.module.js.map