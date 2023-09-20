"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return FetchResourceResponseJob;
    }
});
const _axios = require("@nestjs/axios");
const _common = require("@nestjs/common");
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
let FetchResourceResponseJob = class FetchResourceResponseJob {
    async handle(request) {
        try {
            return await this.httpService.axiosRef({
                url: request.resourceTarget,
                method: 'GET',
                responseType: 'stream'
            });
        } catch (error) {
            // Return a 404 Bad Request response
            return {
                status: 404,
                statusText: 'Bad Request',
                headers: {},
                config: error.config,
                data: null
            };
        }
    }
    constructor(httpService){
        this.httpService = httpService;
    }
};
FetchResourceResponseJob = _ts_decorate([
    (0, _common.Injectable)({
        scope: _common.Scope.REQUEST
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _axios.HttpService === "undefined" ? Object : _axios.HttpService
    ])
], FetchResourceResponseJob);
