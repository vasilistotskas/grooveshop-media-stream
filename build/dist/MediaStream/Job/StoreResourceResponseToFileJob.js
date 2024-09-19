"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var StoreResourceResponseToFileJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const UnableToStoreFetchedResourceException_1 = __importDefault(require("../API/Exception/UnableToStoreFetchedResourceException"));
const common_1 = require("@nestjs/common");
let StoreResourceResponseToFileJob = StoreResourceResponseToFileJob_1 = class StoreResourceResponseToFileJob {
    constructor() {
        this.logger = new common_1.Logger(StoreResourceResponseToFileJob_1.name);
    }
    async handle(resourceName, path, response) {
        if (!response.data || typeof response.data.pipe !== 'function') {
            this.logger.error('No data found in response or data is not streamable');
            throw new UnableToStoreFetchedResourceException_1.default(resourceName);
        }
        const fd = await (0, promises_1.open)(path, 'w');
        const fileStream = fd.createWriteStream();
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