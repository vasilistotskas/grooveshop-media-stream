"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class UnableToStoreFetchedResourceException extends Error {
    constructor(resource) {
        super(`Requested resource: ${resource} couldn't be stored`);
    }
}
exports.default = UnableToStoreFetchedResourceException;
//# sourceMappingURL=unable-to-store-fetched-resource.exception.js.map