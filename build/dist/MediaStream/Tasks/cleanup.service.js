"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CleanupService = void 0;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_process_1 = require("node:process");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
let CleanupService = CleanupService_1 = class CleanupService {
    constructor() {
        this.logger = new common_1.Logger(CleanupService_1.name);
    }
    async handleCleanup() {
        const projectRoot = (0, node_process_1.cwd)();
        const directoryPath = path.join(projectRoot, 'storage');
        let deletedFilesCount = 0;
        try {
            const files = await fs.readdir(directoryPath);
            for (const file of files) {
                if (file.endsWith('.rst') || file.endsWith('.rsc') || file.endsWith('.rsm') || file.endsWith('.webp')) {
                    await fs.unlink(path.join(directoryPath, file));
                    deletedFilesCount++;
                }
            }
            this.logger.debug(`${deletedFilesCount} files deleted.`);
        }
        catch (err) {
            this.logger.error(`Error during cleanup: ${err}`);
        }
    }
};
exports.CleanupService = CleanupService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_WEEK, {
        name: 'cleanup',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CleanupService.prototype, "handleCleanup", null);
exports.CleanupService = CleanupService = CleanupService_1 = __decorate([
    (0, common_1.Injectable)()
], CleanupService);
//# sourceMappingURL=cleanup.service.js.map