import { ConfigService } from "../../../MediaStream/Config/config.service.js";
import { HttpClientService } from "../../../MediaStream/HTTP/services/http-client.service.js";
import { HttpService, HttpModule as NestHttpModule } from "@nestjs/axios";
import { Test } from "@nestjs/testing";
import { Observable, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
describe('httpClientService', ()=>{
    let service;
    let httpService;
    const mockConfigService = {
        getOptional: vi.fn()
    };
    beforeEach(async ()=>{
        vi.clearAllMocks();
        // Setup default config values
        mockConfigService.getOptional.mockImplementation((_key, defaultValue)=>{
            return defaultValue;
        });
        const module = await Test.createTestingModule({
            imports: [
                NestHttpModule
            ],
            providers: [
                HttpClientService,
                {
                    provide: ConfigService,
                    useValue: mockConfigService
                }
            ]
        }).compile();
        service = module.get(HttpClientService);
        httpService = module.get(HttpService);
    });
    describe('initialization', ()=>{
        it('should be defined', ()=>{
            expect(service).toBeDefined();
        });
        it('should load configuration from ConfigService', ()=>{
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.retry.retries', 3);
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.retry.retryDelay', 1000);
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.retry.maxRetryDelay', 10000);
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.connectionPool.timeout', 30000);
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.circuitBreaker.failureThreshold', 50);
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.circuitBreaker.resetTimeout', 30000);
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.circuitBreaker.monitoringPeriod', 60000);
            expect(mockConfigService.getOptional).toHaveBeenCalledWith('http.circuitBreaker.minimumRequests', 10);
        });
    });
    describe('hTTP Methods', ()=>{
        it('should execute GET requests', async ()=>{
            const mockResponse = {
                data: {
                    test: 'data'
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    url: 'https://example.com',
                    method: 'get'
                }
            };
            vi.spyOn(httpService, 'get').mockReturnValueOnce(of(mockResponse));
            const result = await service.get('https://example.com');
            expect(result).toEqual(mockResponse);
            expect(httpService.get).toHaveBeenCalledWith(expect.stringContaining('example.com'), expect.any(Object));
        });
        it('should execute POST requests', async ()=>{
            const mockResponse = {
                data: {
                    test: 'data'
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    url: 'https://example.com',
                    method: 'post'
                }
            };
            const postData = {
                foo: 'bar'
            };
            vi.spyOn(httpService, 'post').mockReturnValueOnce(of(mockResponse));
            const result = await service.post('https://example.com', postData);
            expect(result).toEqual(mockResponse);
            expect(httpService.post).toHaveBeenCalledWith('https://example.com', postData, expect.any(Object));
        });
    });
    describe('error Handling', ()=>{
        beforeEach(()=>{
            vi.useFakeTimers();
        });
        afterEach(()=>{
            vi.useRealTimers();
        });
        it('should handle network errors', async ()=>{
            const mockError = new Error('Network Error');
            mockError.code = 'ECONNRESET';
            mockError.message = 'Connection reset';
            vi.spyOn(httpService, 'get').mockReturnValueOnce(throwError(()=>mockError));
            const promise = service.get('https://example.com');
            vi.runAllTimers();
            await expect(promise).rejects.toThrow();
        });
        it('should handle HTTP errors', async ()=>{
            const mockError = new Error('HTTP Error');
            mockError.response = {
                status: 500,
                data: 'Server Error'
            };
            vi.spyOn(httpService, 'get').mockReturnValueOnce(throwError(()=>mockError));
            const promise = service.get('https://example.com');
            vi.runAllTimers();
            await expect(promise).rejects.toThrow();
        });
    });
    describe('circuit Breaker', ()=>{
        it('should track successful requests', async ()=>{
            const mockResponse = {
                data: {
                    test: 'data'
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    url: 'https://example.com',
                    method: 'get'
                }
            };
            vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));
            // Execute several successful requests
            await service.get('https://example.com');
            await service.get('https://example.com');
            await service.get('https://example.com');
            const stats = service.getStats();
            expect(stats.successfulRequests).toBe(3);
            expect(stats.failedRequests).toBe(0);
            expect(stats.circuitBreakerState).toBe('closed');
        });
        it('should track failed requests', async ()=>{
            const mockError = new Error('HTTP Error');
            mockError.response = {
                status: 500,
                data: 'Server Error'
            };
            vi.spyOn(httpService, 'get').mockReturnValue(throwError(()=>mockError));
            // Execute several failed requests
            try {
                await service.get('https://example.com');
            } catch  {}
            try {
                await service.get('https://example.com');
            } catch  {}
            const stats = service.getStats();
            expect(stats.successfulRequests).toBe(0);
            expect(stats.failedRequests).toBe(2);
        }, 15000);
        it('should reset statistics', async ()=>{
            const mockResponse = {
                data: {
                    test: 'data'
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    url: 'https://example.com',
                    method: 'get'
                }
            };
            vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));
            // Execute a successful request
            await service.get('https://example.com');
            // Reset stats
            service.resetStats();
            const stats = service.getStats();
            expect(stats.totalRequests).toBe(0);
            expect(stats.successfulRequests).toBe(0);
            expect(stats.failedRequests).toBe(0);
        });
    });
    describe('concurrency Control', ()=>{
        it('should track active requests', async ()=>{
            const mockResponse = {
                data: {
                    test: 'data'
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: {
                    url: 'https://example.com',
                    method: 'get'
                }
            };
            // Create a delayed response
            vi.spyOn(httpService, 'get').mockImplementation(()=>{
                return new Observable((subscriber)=>{
                    setTimeout(()=>{
                        subscriber.next(mockResponse);
                        subscriber.complete();
                    }, 100);
                });
            });
            // Start a request but don't await it
            const promise = service.get('https://example.com');
            // Check active requests
            const stats = service.getStats();
            expect(stats.activeRequests).toBeGreaterThan(0);
            // Wait for request to complete
            await promise;
        });
    });
});

//# sourceMappingURL=http-client.service.spec.js.map