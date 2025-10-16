let UnableToFetchResourceException = class UnableToFetchResourceException extends Error {
    constructor(resource){
        super(`Requested resource: ${resource} couldn't be fetched`);
    }
};
export { UnableToFetchResourceException as default };

//# sourceMappingURL=unable-to-fetch-resource.exception.js.map