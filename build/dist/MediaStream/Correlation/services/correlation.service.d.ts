import { RequestContext, CorrelationService as ICorrelationService } from '../interfaces/correlation.interface';
export declare class CorrelationService implements ICorrelationService {
    private readonly asyncLocalStorage;
    generateCorrelationId(): string;
    setContext(context: RequestContext): void;
    getContext(): RequestContext | null;
    getCorrelationId(): string | null;
    clearContext(): void;
    runWithContext<T>(context: RequestContext, fn: () => T): T;
    updateContext(updates: Partial<RequestContext>): void;
}
