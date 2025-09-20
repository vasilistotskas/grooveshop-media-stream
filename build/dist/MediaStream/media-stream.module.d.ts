import { MiddlewareConsumer, NestModule } from '@nestjs/common';
export default class MediaStreamModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void;
}
