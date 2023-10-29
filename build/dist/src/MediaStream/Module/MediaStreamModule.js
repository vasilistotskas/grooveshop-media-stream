"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const FetchResourceResponseJob_1 = require("../Job/FetchResourceResponseJob");
const WebpImageManipulationJob_1 = require("../Job/WebpImageManipulationJob");
const ValidateCacheImageRequestRule_1 = require("../Rule/ValidateCacheImageRequestRule");
const StoreResourceResponseToFileJob_1 = require("../Job/StoreResourceResponseToFileJob");
const CacheImageResourceOperation_1 = require("../Operation/CacheImageResourceOperation");
const MediaStreamImageRESTController_1 = require("../API/Controller/MediaStreamImageRESTController");
const GenerateResourceIdentityFromRequestJob_1 = require("../Job/GenerateResourceIdentityFromRequestJob");
const ValidateCacheImageRequestResizeTargetRule_1 = require("../Rule/ValidateCacheImageRequestResizeTargetRule");
const controllers = [MediaStreamImageRESTController_1.default];
const operations = [CacheImageResourceOperation_1.default];
const jobs = [
    GenerateResourceIdentityFromRequestJob_1.default,
    FetchResourceResponseJob_1.default,
    StoreResourceResponseToFileJob_1.default,
    WebpImageManipulationJob_1.default
];
const rules = [ValidateCacheImageRequestRule_1.default, ValidateCacheImageRequestResizeTargetRule_1.default];
let MediaStreamModule = class MediaStreamModule {
};
MediaStreamModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule],
        controllers,
        providers: [...jobs, ...rules, ...operations]
    })
], MediaStreamModule);
exports.default = MediaStreamModule;
//# sourceMappingURL=MediaStreamModule.js.map