import type { ResizeOptions } from '@microservice/API/dto/cache-image-request.dto';
import ManipulationJobResult from '@microservice/Queue/dto/manipulation-job-result.dto';
export default class WebpImageManipulationJob {
    private readonly logger;
    handle(filePathFrom: string, filePathTo: string, options: ResizeOptions): Promise<ManipulationJobResult>;
}
