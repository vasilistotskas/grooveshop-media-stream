import CacheImageRequest from '@microservice/API/DTO/CacheImageRequest';
import { InputSanitizationService } from './input-sanitization.service';
import { SecurityCheckerService } from './security-checker.service';
export interface SimpleValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedInput?: any;
}
export declare class SimpleValidationService {
    private readonly sanitizationService;
    private readonly securityChecker;
    private readonly _logger;
    constructor(sanitizationService: InputSanitizationService, securityChecker: SecurityCheckerService);
    validateCacheImageRequest(request: CacheImageRequest): Promise<SimpleValidationResult>;
    validateInput(input: any): Promise<SimpleValidationResult>;
}
