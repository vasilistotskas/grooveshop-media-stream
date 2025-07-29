export interface ValidationError {
    field: string;
    message: string;
    value?: any;
    code?: string;
}
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    sanitized?: any;
}
export interface IValidator<T> {
    validate: (input: T) => Promise<ValidationResult>;
}
export interface ISanitizer<T> {
    sanitize: (input: T) => Promise<T>;
}
export interface ISecurityChecker {
    checkForMaliciousContent: (input: any) => Promise<boolean>;
    logSecurityEvent: (event: SecurityEvent) => Promise<void>;
}
export interface SecurityEvent {
    type: 'malicious_content' | 'invalid_url' | 'oversized_request' | 'suspicious_pattern';
    source: string;
    details: any;
    timestamp?: Date;
    clientIp?: string;
    userAgent?: string;
}
