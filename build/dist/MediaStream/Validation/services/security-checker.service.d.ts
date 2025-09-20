import { ConfigService } from '@microservice/Config/config.service';
import { ISecurityChecker, SecurityEvent } from '../interfaces/validator.interface';
export declare class SecurityCheckerService implements ISecurityChecker {
    private readonly _configService;
    private readonly _logger;
    private readonly suspiciousPatterns;
    private readonly securityEvents;
    constructor(_configService: ConfigService);
    checkForMaliciousContent(input: any): Promise<boolean>;
    private checkString;
    private checkObject;
    private hasHighEntropy;
    private getObjectDepth;
    logSecurityEvent(event: SecurityEvent): Promise<void>;
    getSecurityEvents(limit?: number): SecurityEvent[];
    getSecurityStats(): {
        totalEvents: number;
        eventsByType: {
            [key: string]: number;
        };
        recentEvents: number;
    };
}
