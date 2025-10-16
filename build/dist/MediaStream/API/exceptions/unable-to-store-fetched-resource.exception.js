let UnableToStoreFetchedResourceException = class UnableToStoreFetchedResourceException extends Error {
    constructor(resource){
        super(`Requested resource: ${resource} couldn't be stored`);
    }
};
export { UnableToStoreFetchedResourceException as default };

//# sourceMappingURL=unable-to-store-fetched-resource.exception.js.map