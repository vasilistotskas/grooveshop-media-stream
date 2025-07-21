import { MetricsService } from '../services/metrics.service';
import { ConfigService } from '@microservice/Config/config.service';
export declare class MetricsController {
    private readonly metricsService;
    private readonly configService;
    constructor(metricsService: MetricsService, configService: ConfigService);
    getMetrics(): Promise<string>;
    getMetricsJson(): Promise<{
        error: string;
        timestamp?: undefined;
        metrics?: undefined;
        registry?: undefined;
        format?: undefined;
    } | {
        timestamp: string;
        metrics: string;
        registry: string;
        format: string;
        error?: undefined;
    }>;
}
