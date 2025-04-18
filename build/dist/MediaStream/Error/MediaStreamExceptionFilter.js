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
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
let MediaStreamExceptionFilter = MediaStreamExceptionFilter_1 = class MediaStreamExceptionFilter {
    constructor(httpAdapterHost) {
        this.httpAdapterHost = httpAdapterHost;
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
            this.logger.error(`MediaStream Error: ${exception.message}`, exception.toJSON());
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
            this.logger.error(`HTTP Exception: ${exception.message}`, errorResponse);
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
            this.logger.error(`Unexpected Error: ${exception.message}`, {
                ...errorResponse,
                stack: exception.stack,
            });
        }
        httpAdapter.reply(response, errorResponse, status);
    }
    formatErrorResponse(error, request) {
        const timestamp = new Date().toISOString();
        const path = request.url;
        const method = request.method;
        if (error instanceof MediaStreamErrors_1.MediaStreamError) {
            const { stack, ...errorDetails } = error.toJSON();
            return {
                ...errorDetails,
                timestamp,
                path,
                method,
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
            context: error.context || {},
        };
    }
};
exports.MediaStreamExceptionFilter = MediaStreamExceptionFilter;
exports.MediaStreamExceptionFilter = MediaStreamExceptionFilter = MediaStreamExceptionFilter_1 = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [core_1.HttpAdapterHost])
], MediaStreamExceptionFilter);
//# sourceMappingURL=MediaStreamExceptionFilter.js.map