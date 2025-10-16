function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Transform } from "class-transformer";
import { IsArray, IsNumber, IsString, Max, Min } from "class-validator";
export class ProcessingConfigDto {
    constructor(){
        this.maxConcurrent = 10;
        this.timeout = 30000;
        this.retries = 3;
        this.maxFileSize = 10485760;
        this.allowedFormats = [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif',
            'svg'
        ];
    }
}
_ts_decorate([
    IsNumber(),
    Min(1),
    Max(100),
    Transform(({ value })=>{
        const parsed = Number.parseInt(value);
        return Number.isNaN(parsed) ? 10 : parsed;
    }),
    _ts_metadata("design:type", Number)
], ProcessingConfigDto.prototype, "maxConcurrent", void 0);
_ts_decorate([
    IsNumber(),
    Min(1000),
    Max(300000),
    Transform(({ value })=>Number.parseInt(value) || 30000),
    _ts_metadata("design:type", Number)
], ProcessingConfigDto.prototype, "timeout", void 0);
_ts_decorate([
    IsNumber(),
    Min(0),
    Max(10),
    Transform(({ value })=>Number.parseInt(value) || 3),
    _ts_metadata("design:type", Number)
], ProcessingConfigDto.prototype, "retries", void 0);
_ts_decorate([
    IsNumber(),
    Min(1024),
    Max(52428800),
    Transform(({ value })=>Number.parseInt(value) || 10485760),
    _ts_metadata("design:type", Number)
], ProcessingConfigDto.prototype, "maxFileSize", void 0);
_ts_decorate([
    IsArray(),
    IsString({
        each: true
    }),
    Transform(({ value })=>{
        if (typeof value === 'string') {
            return value.split(',').map((format)=>format.trim().toLowerCase());
        }
        return value || [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif',
            'svg'
        ];
    }),
    _ts_metadata("design:type", Array)
], ProcessingConfigDto.prototype, "allowedFormats", void 0);

//# sourceMappingURL=processing-config.dto.js.map