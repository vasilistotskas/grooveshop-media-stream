import { CorrelationService } from "../../../MediaStream/Correlation/services/correlation.service.js";
import { CorrelatedLogger } from "../../../MediaStream/Correlation/utils/logger.util.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock the CorrelationService
vi.mock('@microservice/Correlation/services/correlation.service');
describe('correlatedLogger', ()=>{
    let mockCorrelationService;
    let consoleSpy;
    beforeEach(()=>{
        // Setup console spies
        consoleSpy = {
            log: vi.spyOn(console, 'log').mockImplementation(()=>{}),
            error: vi.spyOn(console, 'error').mockImplementation(()=>{}),
            warn: vi.spyOn(console, 'warn').mockImplementation(()=>{}),
            debug: vi.spyOn(console, 'debug').mockImplementation(()=>{})
        };
        // Mock the static correlation service instance
        mockCorrelationService = new CorrelationService();
        CorrelatedLogger.setCorrelationService(mockCorrelationService);
    });
    afterEach(()=>{
        Object.values(consoleSpy).forEach((spy)=>spy.mockRestore());
    });
    describe('log', ()=>{
        it('should log with correlation ID when available', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.log('Test message');
            expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] Test message');
        });
        it('should log without correlation ID when not available', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue(null);
            CorrelatedLogger.log('Test message');
            expect(consoleSpy.log).toHaveBeenCalledWith(' Test message');
        });
        it('should include context when provided', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.log('Test message', 'TestContext');
            expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] [TestContext] Test message');
        });
        it('should handle missing correlation ID and context', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue(null);
            CorrelatedLogger.log('Test message', 'TestContext');
            expect(consoleSpy.log).toHaveBeenCalledWith(' [TestContext] Test message');
        });
    });
    describe('error', ()=>{
        it('should log error with correlation ID', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.error('Error message');
            expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] ERROR: Error message');
        });
        it('should log error with trace when provided', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.error('Error message', 'Stack trace here', 'ErrorContext');
            expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] [ErrorContext] ERROR: Error message');
            expect(consoleSpy.error).toHaveBeenCalledWith('[test-correlation-id] [ErrorContext] TRACE: Stack trace here');
        });
        it('should handle missing correlation ID', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue(null);
            CorrelatedLogger.error('Error message');
            expect(consoleSpy.error).toHaveBeenCalledWith(' ERROR: Error message');
        });
    });
    describe('warn', ()=>{
        it('should log warning with correlation ID', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.warn('Warning message');
            expect(consoleSpy.warn).toHaveBeenCalledWith('[test-correlation-id] WARN: Warning message');
        });
        it('should log warning with context', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.warn('Warning message', 'WarnContext');
            expect(consoleSpy.warn).toHaveBeenCalledWith('[test-correlation-id] [WarnContext] WARN: Warning message');
        });
    });
    describe('debug', ()=>{
        it('should log debug message with correlation ID', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.debug('Debug message');
            expect(consoleSpy.debug).toHaveBeenCalledWith('[test-correlation-id] DEBUG: Debug message');
        });
        it('should log debug message with context', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.debug('Debug message', 'DebugContext');
            expect(consoleSpy.debug).toHaveBeenCalledWith('[test-correlation-id] [DebugContext] DEBUG: Debug message');
        });
    });
    describe('verbose', ()=>{
        it('should log verbose message with correlation ID', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.verbose('Verbose message');
            expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] VERBOSE: Verbose message');
        });
        it('should log verbose message with context', ()=>{
            mockCorrelationService.getCorrelationId.mockReturnValue('test-correlation-id');
            CorrelatedLogger.verbose('Verbose message', 'VerboseContext');
            expect(consoleSpy.log).toHaveBeenCalledWith('[test-correlation-id] [VerboseContext] VERBOSE: Verbose message');
        });
    });
});

//# sourceMappingURL=logger.util.spec.js.map