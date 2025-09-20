import { CorrelationService } from '../services/correlation.service';
export declare class CorrelatedLogger {
    private static _correlationService;
    static setCorrelationService(service: CorrelationService): void;
    private static getCorrelationService;
    static log(message: string, context?: string): void;
    static error(message: string, trace?: string, context?: string): void;
    static warn(message: string, context?: string): void;
    static debug(message: string, context?: string): void;
    static verbose(message: string, context?: string): void;
}
