"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
let GenerateResourceIdentityFromRequestJob = class GenerateResourceIdentityFromRequestJob {
    async handle(_cacheImageRequest) {
        return (0, node_crypto_1.randomUUID)();
    }
};
GenerateResourceIdentityFromRequestJob = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST })
], GenerateResourceIdentityFromRequestJob);
exports.default = GenerateResourceIdentityFromRequestJob;
//# sourceMappingURL=GenerateResourceIdentityFromRequestJob.js.map