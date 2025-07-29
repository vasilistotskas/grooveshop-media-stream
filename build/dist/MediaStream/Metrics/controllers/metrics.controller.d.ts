import { MetricsService } from '../services/metrics.service';
export declare class MetricsController {
    private readonly metricsService;
    constructor(metricsService: MetricsService);
    getMetrics(): Promise<string>;
    getMetricsHealth(): {
        status: string;
        timestamp: number;
        service: string;
        registry: {
            metricsCount: number;
        };
    };
}
