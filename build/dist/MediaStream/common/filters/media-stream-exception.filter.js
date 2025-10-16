function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { MediaStreamError } from "../errors/media-stream.errors.js";
import { CorrelationService } from "../../Correlation/services/correlation.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
export class MediaStreamExceptionFilter {
    constructor(httpAdapterHost, _correlationService){
        this.httpAdapterHost = httpAdapterHost;
        this._correlationService = _correlationService;
    }
    catch(exception, host) {
        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status;
        let errorResponse;
        if (exception instanceof MediaStreamError) {
            status = exception.status;
            errorResponse = this.formatErrorResponse(exception, request);
            CorrelatedLogger.error(`MediaStream Error: ${exception.message}`, JSON.stringify(exception.toJSON()), MediaStreamExceptionFilter.name);
        } else if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            const message = typeof exceptionResponse === 'object' && 'message' in exceptionResponse ? exceptionResponse.message : exception.message;
            errorResponse = this.formatErrorResponse({
                name: exception.name,
                message,
                status,
                code: `HTTP_${status}`,
                context: {
                    path: request.url,
                    method: request.method
                }
            }, request);
            CorrelatedLogger.error(`HTTP Exception: ${exception.message}`, JSON.stringify(errorResponse), MediaStreamExceptionFilter.name);
        } else {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            errorResponse = this.formatErrorResponse({
                name: 'InternalServerError',
                message: 'An unexpected error occurred',
                status,
                code: 'INTERNAL_SERVER_ERROR',
                context: {
                    path: request.url,
                    method: request.method
                }
            }, request);
            CorrelatedLogger.error(`Unexpected Error: ${exception.message}`, exception.stack || '', MediaStreamExceptionFilter.name);
        }
        httpAdapter.reply(response, errorResponse, status);
    }
    /**
	 * Formats the error response with consistent structure
	 */ formatErrorResponse(error, request) {
        const timestamp = new Date().toISOString();
        const path = request.url;
        const method = request.method;
        const correlationId = this._correlationService.getCorrelationId();
        if (error instanceof MediaStreamError) {
            const { stack, ...errorDetails } = error.toJSON();
            return {
                ...errorDetails,
                timestamp,
                path,
                method,
                correlationId
            };
        }
        return {
            name: error.name,
            message: error.message,
            code: error.code,
            status: error.status,
            timestamp,
            path,
            method,
            correlationId,
            context: error.context || {}
        };
    }
}
MediaStreamExceptionFilter = _ts_decorate([
    Catch(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof HttpAdapterHost === "undefined" ? Object : HttpAdapterHost,
        typeof CorrelationService === "undefined" ? Object : CorrelationService
    ])
], MediaStreamExceptionFilter);

//# sourceMappingURL=media-stream-exception.filter.js.map