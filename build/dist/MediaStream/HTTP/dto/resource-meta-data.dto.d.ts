export declare const defaultPrivateTTL: number;
export declare const defaultPublicTTL: number;
export declare const resourceMetaVersion = 1;
export default class ResourceMetaData {
    version: number;
    size: string;
    format: string;
    dateCreated: number;
    privateTTL: number;
    publicTTL: number;
    constructor(data?: Partial<ResourceMetaData>);
}
