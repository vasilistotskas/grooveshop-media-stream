function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cwd } from "node:process";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
export class CleanupService {
    constructor(logger){
        this.logger = logger;
    }
    async handleCleanup() {
        const projectRoot = cwd();
        const directoryPath = path.join(projectRoot, 'storage');
        let deletedFilesCount = 0;
        try {
            const files = await fs.readdir(directoryPath);
            for (const file of files){
                if (file.endsWith('.rst') || file.endsWith('.rsc') || file.endsWith('.rsm') || file.endsWith('.webp')) {
                    await fs.unlink(path.join(directoryPath, file));
                    deletedFilesCount++;
                }
            }
            this.logger.debug(`${deletedFilesCount} files deleted.`);
        } catch (err) {
            this.logger.error(`Error during cleanup: ${err}`);
        }
    }
}
_ts_decorate([
    Cron(CronExpression.EVERY_WEEK, {
        name: 'cleanup'
    }),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", []),
    _ts_metadata("design:returntype", Promise)
], CleanupService.prototype, "handleCleanup", null);
CleanupService = _ts_decorate([
    Injectable(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof Logger === "undefined" ? Object : Logger
    ])
], CleanupService);

//# sourceMappingURL=cleanup.service.js.map