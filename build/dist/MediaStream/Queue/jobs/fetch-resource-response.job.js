function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { HttpService } from "@nestjs/axios";
import { Injectable, Logger, Scope } from "@nestjs/common";
import { isAxiosError } from "axios";
let FetchResourceResponseJob = class FetchResourceResponseJob {
    async handle(request) {
        try {
            return await this._httpService.axiosRef({
                url: request.resourceTarget,
                method: 'GET',
                responseType: 'stream'
            });
        } catch (error) {
            if (isAxiosError(error)) {
                this._logger.error(error.toJSON());
                return {
                    status: error.response?.status ?? 404,
                    statusText: error.response?.statusText ?? 'Bad Request',
                    headers: {},
                    config: error.config || {},
                    data: null
                };
            } else {
                this._logger.error('Unknown error occurred while fetching resource');
                throw error;
            }
        }
    }
    constructor(_httpService){
        this._httpService = _httpService;
        this._logger = new Logger(FetchResourceResponseJob.name);
        this._logger.debug('HttpService has been injected successfully');
    }
};
export { FetchResourceResponseJob as default };
FetchResourceResponseJob = _ts_decorate([
    Injectable({
        scope: Scope.REQUEST
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof HttpService === "undefined" ? Object : HttpService
    ])
], FetchResourceResponseJob);

//# sourceMappingURL=fetch-resource-response.job.js.map