export default class UnableToStoreFetchedResourceException extends Error {
    constructor(resource){
        super(`Requested resource: ${resource} couldn't be stored`);
    }
}

//# sourceMappingURL=unable-to-store-fetched-resource.exception.js.map