"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultCacheKeyStrategy = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
let DefaultCacheKeyStrategy = class DefaultCacheKeyStrategy {
    constructor() {
        this.separator = ':';
        this.hashAlgorithm = 'sha256';
    }
    generateKey(namespace, identifier, params) {
        const parts = [namespace, identifier];
        if (params && Object.keys(params).length > 0) {
            const sortedParams = Object.keys(params)
                .sort()
                .map(key => `${key}=${params[key]}`)
                .join('&');
            parts.push(this.generateHash(sortedParams));
        }
        return parts.join(this.separator);
    }
    parseKey(key) {
        const parts = key.split(this.separator);
        if (parts.length < 2) {
            throw new Error(`Invalid cache key format: ${key}`);
        }
        return {
            namespace: parts[0],
            identifier: parts[1],
            params: parts.length > 2 ? { hash: parts[2] } : undefined,
        };
    }
    generateHash(input) {
        return (0, node_crypto_1.createHash)(this.hashAlgorithm)
            .update(input)
            .digest('hex')
            .substring(0, 16);
    }
};
exports.DefaultCacheKeyStrategy = DefaultCacheKeyStrategy;
exports.DefaultCacheKeyStrategy = DefaultCacheKeyStrategy = __decorate([
    (0, common_1.Injectable)()
], DefaultCacheKeyStrategy);
//# sourceMappingURL=cache-key.strategy.js.map