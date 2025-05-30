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
Object.defineProperty(exports, "__esModule", { value: true });
const MediaStreamImageRESTController_1 = __importDefault(require("../API/Controller/MediaStreamImageRESTController"));
const MediaStreamExceptionFilter_1 = require("../Error/MediaStreamExceptionFilter");
const FetchResourceResponseJob_1 = __importDefault(require("../Job/FetchResourceResponseJob"));
const GenerateResourceIdentityFromRequestJob_1 = __importDefault(require("../Job/GenerateResourceIdentityFromRequestJob"));
const StoreResourceResponseToFileJob_1 = __importDefault(require("../Job/StoreResourceResponseToFileJob"));
const WebpImageManipulationJob_1 = __importDefault(require("../Job/WebpImageManipulationJob"));
const CacheImageResourceOperation_1 = __importDefault(require("../Operation/CacheImageResourceOperation"));
const ValidateCacheImageRequestResizeTargetRule_1 = __importDefault(require("../Rule/ValidateCacheImageRequestResizeTargetRule"));
const ValidateCacheImageRequestRule_1 = __importDefault(require("../Rule/ValidateCacheImageRequestRule"));
const tasks_module_1 = require("../Tasks/tasks.module");
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const schedule_1 = require("@nestjs/schedule");
const controllers = [MediaStreamImageRESTController_1.default];
const operations = [CacheImageResourceOperation_1.default];
const jobs = [
    GenerateResourceIdentityFromRequestJob_1.default,
    FetchResourceResponseJob_1.default,
    StoreResourceResponseToFileJob_1.default,
    WebpImageManipulationJob_1.default,
];
const rules = [ValidateCacheImageRequestRule_1.default, ValidateCacheImageRequestResizeTargetRule_1.default];
let MediaStreamModule = class MediaStreamModule {
};
MediaStreamModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule, schedule_1.ScheduleModule.forRoot(), tasks_module_1.TasksModule],
        controllers,
        providers: [
            ...jobs,
            ...rules,
            ...operations,
            {
                provide: core_1.APP_FILTER,
                useClass: MediaStreamExceptionFilter_1.MediaStreamExceptionFilter,
            },
        ],
    })
], MediaStreamModule);
exports.default = MediaStreamModule;
//# sourceMappingURL=MediaStreamModule.js.map