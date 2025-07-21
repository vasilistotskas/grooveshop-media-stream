import { CorrelationService } from '@microservice/Correlation/services/correlation.service';
import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
export declare class MediaStreamExceptionFilter implements ExceptionFilter {
    private readonly httpAdapterHost;
    private readonly correlationService;
    private readonly logger;
    constructor(httpAdapterHost: HttpAdapterHost, correlationService: CorrelationService);
    catch(exception: Error, host: ArgumentsHost): void;
    private formatErrorResponse;
}
