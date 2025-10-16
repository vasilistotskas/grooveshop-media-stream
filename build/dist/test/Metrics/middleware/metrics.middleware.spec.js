import { MetricsMiddleware } from "../../../MediaStream/Metrics/middleware/metrics.middleware.js";
import { MetricsService } from "../../../MediaStream/Metrics/services/metrics.service.js";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "reflect-metadata";
describe('metricsMiddleware', ()=>{
    let middleware;
    let metricsService;
    let mockRequest;
    let mockResponse;
    let nextFunction;
    beforeEach(async ()=>{
        const mockMetricsService = {
            incrementRequestsInFlight: vi.fn(),
            decrementRequestsInFlight: vi.fn(),
            recordHttpRequest: vi.fn(),
            recordError: vi.fn()
        };
        const module = await Test.createTestingModule({
            providers: [
                MetricsMiddleware,
                {
                    provide: MetricsService,
                    useValue: mockMetricsService
                }
            ]
        }).compile();
        middleware = module.get(MetricsMiddleware);
        metricsService = module.get(MetricsService);
        mockRequest = {
            method: 'GET',
            url: '/test?param=value',
            headers: {
                'content-type': 'application/json',
                'user-agent': 'test-agent'
            },
            get: vi.fn((header)=>{
                if (header === 'content-length') return '100';
                if (header === 'set-cookie') return [
                    'cookie1',
                    'cookie2'
                ];
                return undefined;
            })
        };
        mockResponse = {
            statusCode: 200,
            end: vi.fn(),
            on: vi.fn().mockReturnValue({})
        };
        nextFunction = vi.fn();
    });
    describe('use', ()=>{
        it('should track request metrics on successful request', async ()=>{
            const finishCallback = vi.fn();
            mockResponse.on = vi.fn((event, callback)=>{
                if (event === 'finish') {
                    finishCallback.mockImplementation(callback);
                }
                return {};
            });
            middleware.use(mockRequest, mockResponse, nextFunction);
            expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1);
            expect(nextFunction).toHaveBeenCalledTimes(1);
            // Simulate response finish
            await new Promise((resolve)=>setTimeout(resolve, 10));
            finishCallback();
            expect(metricsService.recordHttpRequest).toHaveBeenCalledWith('GET', '/test', 200, expect.any(Number), 100, 0);
            expect(metricsService.decrementRequestsInFlight).toHaveBeenCalledTimes(1);
        });
        it('should handle request without content-length header', ()=>{
            mockRequest.get = vi.fn(()=>undefined);
            middleware.use(mockRequest, mockResponse, nextFunction);
            expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1);
            expect(nextFunction).toHaveBeenCalledTimes(1);
        });
        it('should track requests in flight', ()=>{
            middleware.use(mockRequest, mockResponse, nextFunction);
            expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1);
            expect(nextFunction).toHaveBeenCalledTimes(1);
        });
        it('should normalize route with numeric ID', ()=>{
            mockRequest.url = '/users/123/profile';
            middleware.use(mockRequest, mockResponse, nextFunction);
            expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1);
        });
        it('should normalize route with UUID', ()=>{
            mockRequest.url = '/users/550e8400-e29b-41d4-a716-446655440000/profile';
            middleware.use(mockRequest, mockResponse, nextFunction);
            expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1);
        });
        it('should use route path when available', ()=>{
            mockRequest.route = {
                path: '/api/users/:id'
            };
            middleware.use(mockRequest, mockResponse, nextFunction);
            expect(metricsService.incrementRequestsInFlight).toHaveBeenCalledTimes(1);
        });
    });
});

//# sourceMappingURL=metrics.middleware.spec.js.map