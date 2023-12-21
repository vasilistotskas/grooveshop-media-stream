import { ResizeOptions } from '@microservice/API/DTO/CacheImageRequest';
import ManipulationJobResult from '@microservice/DTO/ManipulationJobResult';
export default class WebpImageManipulationJob {
    handle(filePathFrom: string, filePathTo: string, options: ResizeOptions): Promise<ManipulationJobResult>;
}
