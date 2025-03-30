import { Logger } from '@nestjs/common';
export declare class CleanupService {
    private readonly logger;
    constructor(logger: Logger);
    handleCleanup(): Promise<void>;
}
