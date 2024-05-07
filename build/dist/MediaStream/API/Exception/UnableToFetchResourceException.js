"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class UnableToFetchResourceException extends Error {
    constructor(resource) {
        super(`Requested resource: ${resource} couldn't be fetched`);
    }
}
exports.default = UnableToFetchResourceException;
//# sourceMappingURL=UnableToFetchResourceException.js.map