import { AxiosResponse } from 'axios';
export default class StoreResourceResponseToFileJob {
    handle(resourceName: string, path: string, response: AxiosResponse): Promise<void>;
}
