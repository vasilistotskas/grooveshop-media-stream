function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import { Transform, Type } from "class-transformer";
import { IsNumber, IsString, Max, Min, ValidateNested } from "class-validator";
export class CorsConfigDto {
    constructor(){
        this.origin = '*';
        this.methods = 'GET';
        this.maxAge = 86400;
    }
}
_ts_decorate([
    IsString(),
    Transform(({ value })=>value || '*'),
    _ts_metadata("design:type", String)
], CorsConfigDto.prototype, "origin", void 0);
_ts_decorate([
    IsString(),
    Transform(({ value })=>value || 'GET'),
    _ts_metadata("design:type", String)
], CorsConfigDto.prototype, "methods", void 0);
_ts_decorate([
    IsNumber(),
    Min(0),
    Max(86400),
    Transform(({ value })=>Number.parseInt(value) || 86400),
    _ts_metadata("design:type", Number)
], CorsConfigDto.prototype, "maxAge", void 0);
export class ServerConfigDto {
    constructor(){
        this.port = 3003;
        this.host = '0.0.0.0';
        this.cors = new CorsConfigDto();
    }
}
_ts_decorate([
    IsNumber(),
    Min(1),
    Max(65535),
    Transform(({ value })=>{
        if (value === undefined || value === null) return 3003;
        const parsed = Number.parseInt(value);
        return Number.isNaN(parsed) ? value : parsed;
    }),
    _ts_metadata("design:type", Number)
], ServerConfigDto.prototype, "port", void 0);
_ts_decorate([
    IsString(),
    Transform(({ value })=>value || '0.0.0.0'),
    _ts_metadata("design:type", String)
], ServerConfigDto.prototype, "host", void 0);
_ts_decorate([
    ValidateNested(),
    Type(()=>CorsConfigDto),
    _ts_metadata("design:type", typeof CorsConfigDto === "undefined" ? Object : CorsConfigDto)
], ServerConfigDto.prototype, "cors", void 0);

//# sourceMappingURL=server-config.dto.js.map