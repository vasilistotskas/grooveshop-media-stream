import type { AxiosResponse } from 'axios';
export default class StoreResourceResponseToFileJob {
    private readonly logger;
    handle(resourceName: string, path: string, response: AxiosResponse): Promise<void>;
}
