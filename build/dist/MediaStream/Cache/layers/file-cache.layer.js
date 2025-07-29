"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var FileCacheLayer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileCacheLayer = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const config_service_1 = require("../../Config/config.service");
const logger_util_1 = require("../../Correlation/utils/logger.util");
const common_1 = require("@nestjs/common");
let FileCacheLayer = FileCacheLayer_1 = class FileCacheLayer {
    constructor(configService) {
        this.configService = configService;
        this.layerName = 'file';
        this.priority = 3;
        this.stats = {
            hits: 0,
            misses: 0,
            errors: 0,
        };
        this.cacheDirectory = this.configService.get('cache.file.directory');
        this.ensureCacheDirectory();
    }
    async get(key) {
        try {
            const filePath = this.getFilePath(key);
            const data = await node_fs_1.promises.readFile(filePath, 'utf8');
            const entry = JSON.parse(data);
            if (entry.ttl && Date.now() - entry.timestamp > entry.ttl * 1000) {
                await this.delete(key);
                this.stats.misses++;
                return null;
            }
            this.stats.hits++;
            return entry.value;
        }
        catch {
            this.stats.misses++;
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            const filePath = this.getFilePath(key);
            const entry = {
                value,
                timestamp: Date.now(),
                ttl,
            };
            await node_fs_1.promises.writeFile(filePath, JSON.stringify(entry), 'utf8');
            logger_util_1.CorrelatedLogger.debug(`File cache SET: ${key}`, FileCacheLayer_1.name);
        }
        catch (error) {
            this.stats.errors++;
            logger_util_1.CorrelatedLogger.error(`File cache SET failed: ${error.message}`, error.stack, FileCacheLayer_1.name);
        }
    }
    async delete(key) {
        try {
            const filePath = this.getFilePath(key);
            await node_fs_1.promises.unlink(filePath);
            logger_util_1.CorrelatedLogger.debug(`File cache DELETE: ${key}`, FileCacheLayer_1.name);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                this.stats.errors++;
                logger_util_1.CorrelatedLogger.error(`File cache DELETE failed: ${error.message}`, error.stack, FileCacheLayer_1.name);
            }
        }
    }
    async exists(key) {
        try {
            const filePath = this.getFilePath(key);
            await node_fs_1.promises.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async clear() {
        try {
            const files = await node_fs_1.promises.readdir(this.cacheDirectory);
            await Promise.all(files.map(file => node_fs_1.promises.unlink((0, node_path_1.join)(this.cacheDirectory, file)).catch(() => { })));
            logger_util_1.CorrelatedLogger.debug('File cache CLEARED', FileCacheLayer_1.name);
        }
        catch (error) {
            this.stats.errors++;
            logger_util_1.CorrelatedLogger.error(`File cache CLEAR failed: ${error.message}`, error.stack, FileCacheLayer_1.name);
        }
    }
    async getStats() {
        try {
            const files = await node_fs_1.promises.readdir(this.cacheDirectory);
            const totalRequests = this.stats.hits + this.stats.misses;
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys: files.length,
                hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
                errors: this.stats.errors,
            };
        }
        catch {
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys: 0,
                hitRate: 0,
                errors: this.stats.errors + 1,
            };
        }
    }
    getLayerName() {
        return this.layerName;
    }
    getPriority() {
        return this.priority;
    }
    getFilePath(key) {
        const sanitizedKey = key.replace(/[^\w\-.:]/g, '_');
        return (0, node_path_1.join)(this.cacheDirectory, `${sanitizedKey}.json`);
    }
    async ensureCacheDirectory() {
        try {
            await node_fs_1.promises.mkdir(this.cacheDirectory, { recursive: true });
        }
        catch (error) {
            logger_util_1.CorrelatedLogger.error(`Failed to create cache directory: ${error.message}`, error.stack, FileCacheLayer_1.name);
        }
    }
};
exports.FileCacheLayer = FileCacheLayer;
exports.FileCacheLayer = FileCacheLayer = FileCacheLayer_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], FileCacheLayer);
//# sourceMappingURL=file-cache.layer.js.map