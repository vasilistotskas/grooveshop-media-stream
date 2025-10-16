function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { BullModule } from "@nestjs/bull";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TerminusModule } from "@nestjs/terminus";
import { CacheModule } from "../Cache/cache.module.js";
import { CorrelationModule } from "../Correlation/correlation.module.js";
import { HttpModule } from "../HTTP/http.module.js";
import { JobQueueHealthIndicator } from "./indicators/job-queue-health.indicator.js";
import { CacheOperationsProcessor } from "./processors/cache-operations.processor.js";
import { ImageProcessingProcessor } from "./processors/image-processing.processor.js";
import { BullQueueService } from "./services/bull-queue.service.js";
import { JobQueueManager } from "./services/job-queue.manager.js";
export class QueueModule {
}
QueueModule = _ts_decorate([
    Module({
        imports: [
            BullModule.forRootAsync({
                imports: [
                    ConfigModule
                ],
                useFactory: async (_configService)=>({
                        redis: {
                            host: _configService.get('REDIS_HOST', 'localhost'),
                            port: _configService.get('REDIS_PORT', 6379),
                            password: _configService.get('REDIS_PASSWORD'),
                            db: _configService.get('REDIS_DB', 0),
                            retryDelayOnFailover: 100,
                            enableReadyCheck: false,
                            maxRetriesPerRequest: 3
                        },
                        defaultJobOptions: {
                            removeOnComplete: 10,
                            removeOnFail: 5,
                            attempts: 3,
                            backoff: {
                                type: 'exponential',
                                delay: 2000
                            }
                        }
                    }),
                inject: [
                    ConfigService
                ]
            }),
            BullModule.registerQueue({
                name: 'image-processing',
                defaultJobOptions: {
                    removeOnComplete: 10,
                    removeOnFail: 5,
                    attempts: 3
                }
            }, {
                name: 'cache-operations',
                defaultJobOptions: {
                    removeOnComplete: 5,
                    removeOnFail: 3,
                    attempts: 2
                }
            }),
            CorrelationModule,
            HttpModule,
            CacheModule,
            TerminusModule
        ],
        providers: [
            BullQueueService,
            JobQueueManager,
            ImageProcessingProcessor,
            CacheOperationsProcessor,
            JobQueueHealthIndicator
        ],
        exports: [
            JobQueueManager,
            JobQueueHealthIndicator
        ]
    })
], QueueModule);

//# sourceMappingURL=queue.module.js.map