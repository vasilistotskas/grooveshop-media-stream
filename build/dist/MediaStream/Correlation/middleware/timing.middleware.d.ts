import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CorrelationService } from '../services/correlation.service';
export declare class TimingMiddleware implements NestMiddleware {
    private readonly correlationService;
    constructor(correlationService: CorrelationService);
    use(req: Request, res: Response, next: NextFunction): void;
    private getLogLevel;
}
