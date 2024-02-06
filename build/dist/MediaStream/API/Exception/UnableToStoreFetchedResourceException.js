"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return UnableToStoreFetchedResourceException;
    }
});
let UnableToStoreFetchedResourceException = class UnableToStoreFetchedResourceException extends Error {
    constructor(resource){
        super(`Requested resource: ${resource} couldn't be stored`);
    }
};

//# sourceMappingURL=UnableToStoreFetchedResourceException.js.map