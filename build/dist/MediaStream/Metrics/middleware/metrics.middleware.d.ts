import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../services/metrics.service';
export declare class MetricsMiddleware implements NestMiddleware {
    private readonly metricsService;
    private readonly _logger;
    constructor(metricsService: MetricsService);
    use(req: Request, res: Response, next: NextFunction): void;
    private getRequestSize;
    private getRoute;
}
