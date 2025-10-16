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
import { IsBoolean, IsNumber, IsString, Max, Min } from "class-validator";
export class MonitoringConfigDto {
    constructor(){
        this.enabled = true;
        this.metricsPort = 9090;
        this.healthPath = '/health';
        this.metricsPath = '/metrics';
    }
}
_ts_decorate([
    IsBoolean(),
    Transform(({ value })=>{
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return value !== undefined ? value : true;
    }),
    _ts_metadata("design:type", Boolean)
], MonitoringConfigDto.prototype, "enabled", void 0);
_ts_decorate([
    IsNumber(),
    Min(1),
    Max(65535),
    Transform(({ value })=>Number.parseInt(value) || 9090),
    _ts_metadata("design:type", Number)
], MonitoringConfigDto.prototype, "metricsPort", void 0);
_ts_decorate([
    IsString(),
    Transform(({ value })=>value || '/health'),
    _ts_metadata("design:type", String)
], MonitoringConfigDto.prototype, "healthPath", void 0);
_ts_decorate([
    IsString(),
    Transform(({ value })=>value || '/metrics'),
    _ts_metadata("design:type", String)
], MonitoringConfigDto.prototype, "metricsPath", void 0);

//# sourceMappingURL=monitoring-config.dto.js.map