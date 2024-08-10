import type { Response } from 'express';
import { HttpService } from '@nestjs/axios';
import type ResourceMetaData from '@microservice/DTO/ResourceMetaData';
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation';
import { BackgroundOptions, FitOptions, PositionOptions, SupportedResizeFormats } from '@microservice/API/DTO/CacheImageRequest';
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob';
export default class MediaStreamImageRESTController {
    private readonly httpService;
    private readonly generateResourceIdentityFromRequestJob;
    private readonly cacheImageResourceOperation;
    private readonly logger;
    constructor(httpService: HttpService, generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob, cacheImageResourceOperation: CacheImageResourceOperation);
    protected static addHeadersToRequest(res: Response, headers: ResourceMetaData): Response;
    private streamRequestedResource;
    private defaultImageFallback;
    private static resourceTargetPrepare;
    uploadedImage(imageType: string, image: string, width: number, height: number, fit: FitOptions, position: PositionOptions, background: BackgroundOptions, trimThreshold: number, format: SupportedResizeFormats, quality: number, res: Response): Promise<void>;
    staticImage(image: string, width: number, height: number, fit: FitOptions, position: PositionOptions, background: BackgroundOptions, trimThreshold: number, format: SupportedResizeFormats, quality: number, res: Response): Promise<void>;
    publicNuxtImage(image: string, width: number, height: number, fit: FitOptions, position: PositionOptions, background: BackgroundOptions, trimThreshold: number, format: SupportedResizeFormats, quality: number, res: Response): Promise<void>;
}
