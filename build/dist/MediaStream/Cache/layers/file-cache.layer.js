function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { ConfigService } from "../../Config/config.service.js";
import { CorrelatedLogger } from "../../Correlation/utils/logger.util.js";
import { Injectable } from "@nestjs/common";
export class FileCacheLayer {
    async get(key) {
        try {
            const filePath = this.getFilePath(key);
            const data = await fs.readFile(filePath, 'utf8');
            const entry = JSON.parse(data);
            if (entry.ttl && Date.now() - entry.timestamp > entry.ttl * 1000) {
                await this.delete(key);
                this.stats.misses++;
                return null;
            }
            this.stats.hits++;
            return entry.value;
        } catch  {
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
                ttl
            };
            await fs.writeFile(filePath, JSON.stringify(entry), 'utf8');
            CorrelatedLogger.debug(`File cache SET: ${key}`, FileCacheLayer.name);
        } catch (error) {
            this.stats.errors++;
            CorrelatedLogger.error(`File cache SET failed: ${error.message}`, error.stack, FileCacheLayer.name);
        }
    }
    async delete(key) {
        try {
            const filePath = this.getFilePath(key);
            await fs.unlink(filePath);
            CorrelatedLogger.debug(`File cache DELETE: ${key}`, FileCacheLayer.name);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.stats.errors++;
                CorrelatedLogger.error(`File cache DELETE failed: ${error.message}`, error.stack, FileCacheLayer.name);
            }
        }
    }
    async exists(key) {
        try {
            const filePath = this.getFilePath(key);
            await fs.access(filePath);
            return true;
        } catch  {
            return false;
        }
    }
    async clear() {
        try {
            const files = await fs.readdir(this.cacheDirectory);
            await Promise.all(files.map((file)=>fs.unlink(join(this.cacheDirectory, file)).catch(()=>{})));
            CorrelatedLogger.debug('File cache CLEARED', FileCacheLayer.name);
        } catch (error) {
            this.stats.errors++;
            CorrelatedLogger.error(`File cache CLEAR failed: ${error.message}`, error.stack, FileCacheLayer.name);
        }
    }
    async getStats() {
        try {
            const files = await fs.readdir(this.cacheDirectory);
            const totalRequests = this.stats.hits + this.stats.misses;
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys: files.length,
                hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
                errors: this.stats.errors
            };
        } catch  {
            return {
                hits: this.stats.hits,
                misses: this.stats.misses,
                keys: 0,
                hitRate: 0,
                errors: this.stats.errors + 1
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
        return join(this.cacheDirectory, `${sanitizedKey}.json`);
    }
    async ensureCacheDirectory() {
        try {
            await fs.mkdir(this.cacheDirectory, {
                recursive: true
            });
        } catch (error) {
            CorrelatedLogger.error(`Failed to create cache directory: ${error.message}`, error.stack, FileCacheLayer.name);
        }
    }
    constructor(_configService){
        this._configService = _configService;
        this.layerName = 'file';
        this.priority = 3;
        this.stats = {
            hits: 0,
            misses: 0,
            errors: 0
        };
        this.cacheDirectory = this._configService.get('cache.file.directory');
        this.ensureCacheDirectory();
    }
}
FileCacheLayer = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof ConfigService === "undefined" ? Object : ConfigService
    ])
], FileCacheLayer);

//# sourceMappingURL=file-cache.layer.js.map