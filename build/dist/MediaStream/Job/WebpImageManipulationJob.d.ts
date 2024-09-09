import ManipulationJobResult from '@microservice/DTO/ManipulationJobResult';
import type { ResizeOptions } from '@microservice/API/DTO/CacheImageRequest';
export default class WebpImageManipulationJob {
    handle(filePathFrom: string, filePathTo: string, options: ResizeOptions): Promise<ManipulationJobResult>;
}
