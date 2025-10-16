export default class UnableToFetchResourceException extends Error {
    constructor(resource){
        super(`Requested resource: ${resource} couldn't be fetched`);
    }
}

//# sourceMappingURL=unable-to-fetch-resource.exception.js.map