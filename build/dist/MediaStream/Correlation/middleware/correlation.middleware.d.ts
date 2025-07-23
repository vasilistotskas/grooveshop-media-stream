import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { CorrelationService } from '../services/correlation.service';
export declare const CORRELATION_ID_HEADER = "x-correlation-id";
export declare class CorrelationMiddleware implements NestMiddleware {
    private readonly correlationService;
    constructor(correlationService: CorrelationService);
    use(req: Request, res: Response, next: NextFunction): void;
    private getClientIp;
}
