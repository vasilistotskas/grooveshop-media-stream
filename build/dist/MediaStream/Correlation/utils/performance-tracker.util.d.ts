export interface PerformancePhase {
    name: string;
    startTime: bigint;
    endTime?: bigint;
    duration?: number;
    metadata?: Record<string, any>;
}
export declare class PerformanceTracker {
    private static phases;
    private static getCorrelationService;
    static startPhase(phaseName: string, metadata?: Record<string, any>): void;
    static endPhase(phaseName: string, metadata?: Record<string, any>): number | null;
    static getPhases(): PerformancePhase[];
    static getSummary(): {
        totalPhases: number;
        completedPhases: number;
        totalDuration: number;
        slowestPhase?: PerformancePhase;
        phases: PerformancePhase[];
    };
    static clearPhases(): void;
    static measure<T>(phaseName: string, fn: () => Promise<T> | T, metadata?: Record<string, any>): Promise<T>;
    static measureMethod(phaseName?: string, metadata?: Record<string, any>): (target: any, propertyName: string, descriptor: PropertyDescriptor) => void;
    static logSummary(): void;
}
