import { INestApplication } from '@nestjs/common';
export declare function gracefulShutdown(app: INestApplication, delay?: number): Promise<void>;
export declare function createStaggeredRequests<T>(requestFactory: (index: number) => Promise<T>, count: number, staggerMs?: number): Promise<T>[];
export declare function getCIFriendlyCount(normalCount: number, ciCount?: number): number;
