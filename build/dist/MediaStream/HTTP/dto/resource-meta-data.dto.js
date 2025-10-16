export const defaultPrivateTTL = 6 * 30 * 24 * 60 * 60 * 1000;
export const defaultPublicTTL = 12 * 30 * 24 * 60 * 60 * 1000;
export const resourceMetaVersion = 1;
export default class ResourceMetaData {
    constructor(data){
        this.size = '';
        this.format = '';
        this.dateCreated = Date.now();
        this.version = data?.version ?? resourceMetaVersion;
        this.publicTTL = data?.publicTTL ?? defaultPublicTTL;
        this.privateTTL = data?.privateTTL ?? defaultPrivateTTL;
        Object.assign(this, data);
    }
}

//# sourceMappingURL=resource-meta-data.dto.js.map