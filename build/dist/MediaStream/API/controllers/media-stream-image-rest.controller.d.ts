import type ResourceMetaData from '@microservice/HTTP/dto/resource-meta-data.dto';
import type { Response } from 'express';
import { BackgroundOptions, FitOptions, PositionOptions, SupportedResizeFormats } from '@microservice/API/dto/cache-image-request.dto';
import CacheImageResourceOperation from '@microservice/Cache/operations/cache-image-resource.operation';
import { CorrelationService } from '@microservice/Correlation/services/correlation.service';
import { MetricsService } from '@microservice/Metrics/services/metrics.service';
import { InputSanitizationService } from '@microservice/Validation/services/input-sanitization.service';
import { SecurityCheckerService } from '@microservice/Validation/services/security-checker.service';
export default class MediaStreamImageRESTController {
    private readonly cacheImageResourceOperation;
    private readonly inputSanitizationService;
    private readonly securityCheckerService;
    private readonly _correlationService;
    private readonly metricsService;
    private readonly _logger;
    constructor(cacheImageResourceOperation: CacheImageResourceOperation, inputSanitizationService: InputSanitizationService, securityCheckerService: SecurityCheckerService, _correlationService: CorrelationService, metricsService: MetricsService);
    private validateRequestParameters;
    protected addHeadersToRequest(res: Response, headers: ResourceMetaData): Response;
    private handleStreamOrFallback;
    private streamFileToResponse;
    private streamResource;
    private fetchAndStreamResource;
    private defaultImageFallback;
    private static resourceTargetPrepare;
    uploadedImage(imageType: string, image: string, width: number | null, height: number | null, fit: FitOptions, position: PositionOptions, background: BackgroundOptions, trimThreshold: number, format: SupportedResizeFormats, quality: number, res: Response): Promise<void>;
    staticImage(image: string, width: number | null, height: number | null, fit: FitOptions, position: PositionOptions, background: BackgroundOptions, trimThreshold: number, format: SupportedResizeFormats, quality: number, res: Response): Promise<void>;
}
