import type { AppConfig } from '@microservice/Config/interfaces/app-config.interface';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
export declare class ConfigService implements OnModuleInit {
    private readonly nestConfigService;
    private readonly logger;
    private config;
    private readonly hotReloadableKeys;
    constructor(nestConfigService: NestConfigService);
    onModuleInit(): Promise<void>;
    get<T = any>(key: string): T;
    getOptional<T = any>(key: string, defaultValue?: T): T;
    getAll(): AppConfig;
    validate(): Promise<void>;
    reload(): Promise<void>;
    isHotReloadable(key: string): boolean;
    private loadAndValidateConfig;
    private loadConfig;
    private updateHotReloadableSettings;
}
