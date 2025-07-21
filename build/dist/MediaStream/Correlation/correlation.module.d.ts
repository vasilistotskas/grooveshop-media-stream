import { MiddlewareConsumer, NestModule } from '@nestjs/common';
export declare class CorrelationModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void;
}
