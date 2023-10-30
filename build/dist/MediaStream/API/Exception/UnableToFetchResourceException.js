"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return UnableToFetchResourceException;
    }
});
var UnableToFetchResourceException;
UnableToFetchResourceException = class UnableToFetchResourceException extends Error {
    constructor(resource){
        super(`Requested resource: ${resource} couldn't be fetched`);
    }
};
