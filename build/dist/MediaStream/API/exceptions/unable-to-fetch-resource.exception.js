"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class UnableToFetchResourceException extends Error {
    constructor(resource) {
        super(`Requested resource: ${resource} couldn't be fetched`);
    }
}
exports.default = UnableToFetchResourceException;
//# sourceMappingURL=unable-to-fetch-resource.exception.js.map