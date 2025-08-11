import { ConfigService } from '../../../MediaStream/Config/config.service';
import { ISanitizer } from '../interfaces/validator.interface';
export declare class InputSanitizationService implements ISanitizer<any> {
    private readonly _configService;
    private readonly _logger;
    private allowedDomains;
    constructor(_configService: ConfigService);
    private getAllowedDomains;
    sanitize(input: any): Promise<any>;
    private sanitizeString;
    private performSanitizationPass;
    private sanitizeObject;
    validateUrl(url: string): boolean;
    validateFileSize(sizeBytes: number, format?: string): boolean;
    validateImageDimensions(width: number, height: number): boolean;
    private removeHtmlTags;
    private removeEventHandlers;
    private removeStyleAttributes;
    private removeDangerousProtocols;
    private removeDangerousJavaScript;
    private removeHtmlEntities;
}
