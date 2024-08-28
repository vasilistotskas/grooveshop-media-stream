"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var StoreResourceResponseToFileJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const common_1 = require("@nestjs/common");
const UnableToStoreFetchedResourceException_1 = __importDefault(require("../API/Exception/UnableToStoreFetchedResourceException"));
let StoreResourceResponseToFileJob = StoreResourceResponseToFileJob_1 = class StoreResourceResponseToFileJob {
    constructor() {
        this.logger = new common_1.Logger(StoreResourceResponseToFileJob_1.name);
    }
    async handle(resourceName, path, response) {
        if (!response.data) {
            this.logger.error('No data found in response');
            throw new UnableToStoreFetchedResourceException_1.default(resourceName);
        }
        const fileStream = fs.createWriteStream(path);
        try {
            response.data.pipe(fileStream);
            await new Promise((resolve, reject) => {
                fileStream.on('finish', resolve).on('error', reject);
            });
        }
        catch (e) {
            this.logger.error(e);
            throw new UnableToStoreFetchedResourceException_1.default(resourceName);
        }
    }
};
StoreResourceResponseToFileJob = StoreResourceResponseToFileJob_1 = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST })
], StoreResourceResponseToFileJob);
exports.default = StoreResourceResponseToFileJob;
//# sourceMappingURL=StoreResourceResponseToFileJob.js.map