import { ConfigService } from '../../../MediaStream/Config/config.service';
import { ISanitizer } from '../interfaces/validator.interface';
export declare class InputSanitizationService implements ISanitizer<any> {
    private readonly configService;
    private readonly logger;
    private allowedDomains;
    constructor(configService: ConfigService);
    private getAllowedDomains;
    sanitize(input: any): Promise<any>;
    private sanitizeString;
    private sanitizeObject;
    validateUrl(url: string): boolean;
    validateFileSize(sizeBytes: number, format?: string): boolean;
    validateImageDimensions(width: number, height: number): boolean;
}
