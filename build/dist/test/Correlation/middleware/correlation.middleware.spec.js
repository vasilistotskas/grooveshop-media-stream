import { CORRELATION_ID_HEADER, CorrelationMiddleware } from "../../../MediaStream/Correlation/middleware/correlation.middleware.js";
import { CorrelationService } from "../../../MediaStream/Correlation/services/correlation.service.js";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
describe('correlationMiddleware', ()=>{
    let middleware;
    let correlationService;
    let mockRequest;
    let mockResponse;
    let mockNext;
    beforeEach(async ()=>{
        const module = await Test.createTestingModule({
            providers: [
                CorrelationService
            ]
        }).compile();
        correlationService = module.get(CorrelationService);
        middleware = new CorrelationMiddleware(correlationService);
        mockRequest = {
            headers: {},
            method: 'GET',
            url: '/test',
            connection: {
                remoteAddress: '127.0.0.1'
            },
            socket: {
                remoteAddress: '127.0.0.1'
            }
        };
        mockResponse = {
            setHeader: vi.fn()
        };
        mockNext = vi.fn();
    });
    afterEach(()=>{
        correlationService.clearContext();
    });
    describe('use', ()=>{
        it('should generate correlation ID when not provided in header', ()=>{
            vi.spyOn(correlationService, 'generateCorrelationId').mockReturnValue('generated-id');
            vi.spyOn(correlationService, 'runWithContext').mockImplementation((context, fn)=>fn());
            middleware.use(mockRequest, mockResponse, mockNext);
            expect(correlationService.generateCorrelationId).toHaveBeenCalled();
            expect(mockResponse.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'generated-id');
            expect(mockNext).toHaveBeenCalled();
        });
        it('should use correlation ID from header when provided', ()=>{
            const existingId = 'existing-correlation-id';
            mockRequest.headers = {
                [CORRELATION_ID_HEADER]: existingId
            };
            vi.spyOn(correlationService, 'generateCorrelationId');
            vi.spyOn(correlationService, 'runWithContext').mockImplementation((context, fn)=>fn());
            middleware.use(mockRequest, mockResponse, mockNext);
            expect(correlationService.generateCorrelationId).not.toHaveBeenCalled();
            expect(mockResponse.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, existingId);
            expect(mockNext).toHaveBeenCalled();
        });
        it('should create request context with correct properties', ()=>{
            const correlationId = 'test-correlation-id';
            mockRequest.headers = {
                [CORRELATION_ID_HEADER]: correlationId,
                'user-agent': 'test-user-agent'
            };
            let capturedContext = null;
            vi.spyOn(correlationService, 'runWithContext').mockImplementation((context, fn)=>{
                capturedContext = context;
                return fn();
            });
            middleware.use(mockRequest, mockResponse, mockNext);
            expect(capturedContext).toMatchObject({
                correlationId,
                clientIp: '127.0.0.1',
                userAgent: 'test-user-agent',
                method: 'GET',
                url: '/test'
            });
            expect(capturedContext.timestamp).toBeDefined();
            expect(capturedContext.startTime).toBeDefined();
        });
        it('should extract client IP from x-forwarded-for header', ()=>{
            mockRequest.headers = {
                'x-forwarded-for': '192.168.1.1, 10.0.0.1'
            };
            let capturedContext = null;
            vi.spyOn(correlationService, 'runWithContext').mockImplementation((context, fn)=>{
                capturedContext = context;
                return fn();
            });
            middleware.use(mockRequest, mockResponse, mockNext);
            expect(capturedContext.clientIp).toBe('192.168.1.1');
        });
        it('should extract client IP from x-real-ip header', ()=>{
            mockRequest.headers = {
                'x-real-ip': '192.168.1.2'
            };
            let capturedContext = null;
            vi.spyOn(correlationService, 'runWithContext').mockImplementation((context, fn)=>{
                capturedContext = context;
                return fn();
            });
            middleware.use(mockRequest, mockResponse, mockNext);
            expect(capturedContext.clientIp).toBe('192.168.1.2');
        });
        it('should fallback to connection.remoteAddress for client IP', ()=>{
            mockRequest.connection = {
                remoteAddress: '192.168.1.3'
            };
            let capturedContext = null;
            vi.spyOn(correlationService, 'runWithContext').mockImplementation((context, fn)=>{
                capturedContext = context;
                return fn();
            });
            middleware.use(mockRequest, mockResponse, mockNext);
            expect(capturedContext.clientIp).toBe('192.168.1.3');
        });
        it('should use "unknown" when no IP can be determined', ()=>{
            mockRequest.connection = {};
            mockRequest.socket = {};
            let capturedContext = null;
            vi.spyOn(correlationService, 'runWithContext').mockImplementation((context, fn)=>{
                capturedContext = context;
                return fn();
            });
            middleware.use(mockRequest, mockResponse, mockNext);
            expect(capturedContext.clientIp).toBe('unknown');
        });
    });
});

//# sourceMappingURL=correlation.middleware.spec.js.map