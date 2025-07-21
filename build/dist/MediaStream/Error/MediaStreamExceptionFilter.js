"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MediaStreamExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaStreamExceptionFilter = void 0;
const MediaStreamErrors_1 = require("./MediaStreamErrors");
const correlation_service_1 = require("../Correlation/services/correlation.service");
const logger_util_1 = require("../Correlation/utils/logger.util");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
let MediaStreamExceptionFilter = MediaStreamExceptionFilter_1 = class MediaStreamExceptionFilter {
    constructor(httpAdapterHost, correlationService) {
        this.httpAdapterHost = httpAdapterHost;
        this.correlationService = correlationService;
        this.logger = new common_1.Logger(MediaStreamExceptionFilter_1.name);
    }
    catch(exception, host) {
        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status;
        let errorResponse;
        if (exception instanceof MediaStreamErrors_1.MediaStreamError) {
            status = exception.status;
            errorResponse = this.formatErrorResponse(exception, request);
            logger_util_1.CorrelatedLogger.error(`MediaStream Error: ${exception.message}`, JSON.stringify(exception.toJSON()), MediaStreamExceptionFilter_1.name);
        }
        else if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            const message = typeof exceptionResponse === 'object' && 'message' in exceptionResponse
                ? exceptionResponse.message
                : exception.message;
            errorResponse = this.formatErrorResponse({
                name: exception.name,
                message,
                status,
                code: `HTTP_${status}`,
                context: {
                    path: request.url,
                    method: request.method,
                },
            }, request);
            logger_util_1.CorrelatedLogger.error(`HTTP Exception: ${exception.message}`, JSON.stringify(errorResponse), MediaStreamExceptionFilter_1.name);
        }
        else {
            status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            errorResponse = this.formatErrorResponse({
                name: 'InternalServerError',
                message: 'An unexpected error occurred',
                status,
                code: 'INTERNAL_SERVER_ERROR',
                context: {
                    path: request.url,
                    method: request.method,
                },
            }, request);
            logger_util_1.CorrelatedLogger.error(`Unexpected Error: ${exception.message}`, exception.stack || '', MediaStreamExceptionFilter_1.name);
        }
        httpAdapter.reply(response, errorResponse, status);
    }
    formatErrorResponse(error, request) {
        const timestamp = new Date().toISOString();
        const path = request.url;
        const method = request.method;
        const correlationId = this.correlationService.getCorrelationId();
        if (error instanceof MediaStreamErrors_1.MediaStreamError) {
            const { stack, ...errorDetails } = error.toJSON();
            return {
                ...errorDetails,
                timestamp,
                path,
                method,
                correlationId,
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
            context: error.context || {},
        };
    }
};
exports.MediaStreamExceptionFilter = MediaStreamExceptionFilter;
exports.MediaStreamExceptionFilter = MediaStreamExceptionFilter = MediaStreamExceptionFilter_1 = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [core_1.HttpAdapterHost,
        correlation_service_1.CorrelationService])
], MediaStreamExceptionFilter);
//# sourceMappingURL=MediaStreamExceptionFilter.js.map