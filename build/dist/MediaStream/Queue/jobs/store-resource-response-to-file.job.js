function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { open } from "node:fs/promises";
import UnableToStoreFetchedResourceException from "../../API/exceptions/unable-to-store-fetched-resource.exception.js";
import { Injectable, Logger, Scope } from "@nestjs/common";
let StoreResourceResponseToFileJob = class StoreResourceResponseToFileJob {
    async handle(resourceName, path, response) {
        if (!response.data || typeof response.data.pipe !== 'function') {
            this._logger.error('No data found in response or data is not streamable');
            throw new UnableToStoreFetchedResourceException(resourceName);
        }
        const fd = await open(path, 'w');
        const fileStream = fd.createWriteStream();
        try {
            response.data.pipe(fileStream);
            await new Promise((resolve, reject)=>{
                fileStream.on('finish', ()=>resolve()).on('error', (error)=>reject(error));
            });
        } catch (e) {
            this._logger.error(e);
            throw new UnableToStoreFetchedResourceException(resourceName);
        }
    }
    constructor(){
        this._logger = new Logger(StoreResourceResponseToFileJob.name);
    }
};
export { StoreResourceResponseToFileJob as default };
StoreResourceResponseToFileJob = _ts_decorate([
    Injectable({
        scope: Scope.REQUEST
    })
], StoreResourceResponseToFileJob);

//# sourceMappingURL=store-resource-response-to-file.job.js.map