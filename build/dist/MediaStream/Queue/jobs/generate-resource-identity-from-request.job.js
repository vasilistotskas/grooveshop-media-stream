function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { Injectable, Scope } from "@nestjs/common";
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
function generateUUIDv5(name, namespace = NAMESPACE_URL) {
    const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
    const hash = createHash('sha1').update(Buffer.concat([
        ns,
        Buffer.from(name)
    ])).digest();
    hash[6] = hash[6] & 0x0F | 0x50;
    hash[8] = hash[8] & 0x3F | 0x80;
    const hex = hash.subarray(0, 16).toString('hex');
    return `${hex.substring(0, 8)}-` + `${hex.substring(8, 12)}-` + `${hex.substring(12, 16)}-` + `${hex.substring(16, 20)}-` + `${hex.substring(20)}`;
}
export default class GenerateResourceIdentityFromRequestJob {
    async handle(cacheImageRequest) {
        const request = JSON.parse(JSON.stringify(cacheImageRequest));
        const requestStr = JSON.stringify(request);
        return generateUUIDv5(requestStr);
    }
}
GenerateResourceIdentityFromRequestJob = _ts_decorate([
    Injectable({
        scope: Scope.REQUEST
    })
], GenerateResourceIdentityFromRequestJob);

//# sourceMappingURL=generate-resource-identity-from-request.job.js.map