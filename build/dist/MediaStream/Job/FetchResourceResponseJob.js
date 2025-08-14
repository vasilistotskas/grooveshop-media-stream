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
var FetchResourceResponseJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const axios_2 = require("axios");
let FetchResourceResponseJob = FetchResourceResponseJob_1 = class FetchResourceResponseJob {
    constructor(_httpService) {
        this._httpService = _httpService;
        this._logger = new common_1.Logger(FetchResourceResponseJob_1.name);
        this._logger.debug('HttpService has been injected successfully');
    }
    async handle(request) {
        try {
            return await this._httpService.axiosRef({
                url: request.resourceTarget,
                method: 'GET',
                responseType: 'stream',
            });
        }
        catch (error) {
            if ((0, axios_2.isAxiosError)(error)) {
                this._logger.error(error.toJSON());
                return {
                    status: error.response?.status ?? 404,
                    statusText: error.response?.statusText ?? 'Bad Request',
                    headers: {},
                    config: error.config || {},
                    data: null,
                };
            }
            else {
                this._logger.error('Unknown error occurred while fetching resource');
                throw error;
            }
        }
    }
};
FetchResourceResponseJob = FetchResourceResponseJob_1 = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.REQUEST }),
    __metadata("design:paramtypes", [axios_1.HttpService])
], FetchResourceResponseJob);
exports.default = FetchResourceResponseJob;
//# sourceMappingURL=FetchResourceResponseJob.js.map