import CacheImageRequest from '../../API/DTO/CacheImageRequest';
import { ConfigService } from '../../Config/config.service';
import { CorrelationService } from '../../Correlation/services/correlation.service';
import { InputSanitizationService } from './input-sanitization.service';
import { SecurityCheckerService } from './security-checker.service';
export interface SimpleValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedInput?: any;
}
export declare class SimpleValidationService {
    private readonly configService;
    private readonly correlationService;
    private readonly sanitizationService;
    private readonly securityChecker;
    private readonly logger;
    constructor(configService: ConfigService, correlationService: CorrelationService, sanitizationService: InputSanitizationService, securityChecker: SecurityCheckerService);
    validateCacheImageRequest(request: CacheImageRequest): Promise<SimpleValidationResult>;
    validateInput(input: any): Promise<SimpleValidationResult>;
}
