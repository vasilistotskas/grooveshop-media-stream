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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ValidateCacheImageRequestResizeTargetRule_1 = __importDefault(require("./ValidateCacheImageRequestResizeTargetRule"));
const common_1 = require("@nestjs/common");
let ValidateCacheImageRequestRule = class ValidateCacheImageRequestRule {
    constructor(validateCacheImageRequestResizeTargetRule) {
        this.validateCacheImageRequestResizeTargetRule = validateCacheImageRequestResizeTargetRule;
    }
    async setup(request) {
        this.request = request;
        await this.validateCacheImageRequestResizeTargetRule.setup(request);
    }
    async apply() {
        await this.validateCacheImageRequestResizeTargetRule.apply();
    }
};
ValidateCacheImageRequestRule = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST }),
    __metadata("design:paramtypes", [ValidateCacheImageRequestResizeTargetRule_1.default])
], ValidateCacheImageRequestRule);
exports.default = ValidateCacheImageRequestRule;
//# sourceMappingURL=ValidateCacheImageRequestRule.js.map