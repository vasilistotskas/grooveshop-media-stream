import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { CorrelationService } from '../services/correlation.service';
export declare class TimingMiddleware implements NestMiddleware {
    private readonly correlationService;
    constructor(correlationService: CorrelationService);
    use(req: Request, res: Response, next: NextFunction): void;
    private getLogLevel;
}
