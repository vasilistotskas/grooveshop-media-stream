export var JobPriority = /*#__PURE__*/ function(JobPriority) {
    JobPriority[JobPriority["LOW"] = 1] = "LOW";
    JobPriority[JobPriority["NORMAL"] = 5] = "NORMAL";
    JobPriority[JobPriority["HIGH"] = 10] = "HIGH";
    JobPriority[JobPriority["CRITICAL"] = 15] = "CRITICAL";
    return JobPriority;
}({});
export var JobType = /*#__PURE__*/ function(JobType) {
    JobType["IMAGE_PROCESSING"] = "image-processing";
    JobType["CACHE_WARMING"] = "cache-warming";
    JobType["CACHE_CLEANUP"] = "cache-cleanup";
    return JobType;
}({});

//# sourceMappingURL=job.types.js.map