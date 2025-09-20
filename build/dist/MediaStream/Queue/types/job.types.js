"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobType = exports.JobPriority = void 0;
var JobPriority;
(function (JobPriority) {
    JobPriority[JobPriority["LOW"] = 1] = "LOW";
    JobPriority[JobPriority["NORMAL"] = 5] = "NORMAL";
    JobPriority[JobPriority["HIGH"] = 10] = "HIGH";
    JobPriority[JobPriority["CRITICAL"] = 15] = "CRITICAL";
})(JobPriority || (exports.JobPriority = JobPriority = {}));
var JobType;
(function (JobType) {
    JobType["IMAGE_PROCESSING"] = "image-processing";
    JobType["CACHE_WARMING"] = "cache-warming";
    JobType["CACHE_CLEANUP"] = "cache-cleanup";
})(JobType || (exports.JobType = JobType = {}));
//# sourceMappingURL=job.types.js.map