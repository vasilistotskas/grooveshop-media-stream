import type { AxiosResponse } from 'axios';
export default class StoreResourceResponseToFileJob {
    private readonly _logger;
    handle(resourceName: string, path: string, response: AxiosResponse): Promise<void>;
}
