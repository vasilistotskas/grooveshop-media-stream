import * as process from "node:process";
/**
 * Utility to help with graceful app shutdown in tests
 */ export async function gracefulShutdown(app, delay = 100) {
    if (!app) return;
    // Add delay to allow pending requests to complete
    await new Promise((resolve)=>setTimeout(resolve, delay));
    try {
        await app.close();
    } catch (error) {
        console.warn('Error during app shutdown:', error);
    }
}
/**
 * Utility to create staggered requests to reduce server load
 */ export function createStaggeredRequests(requestFactory, count, staggerMs = 10) {
    return Array.from({
        length: count
    }, (_, i)=>new Promise((resolve)=>{
            setTimeout(()=>{
                resolve(requestFactory(i));
            }, i * staggerMs);
        }));
}
/**
 * Get CI-friendly request count
 */ export function getCIFriendlyCount(normalCount, ciCount) {
    return process.env.CI ? ciCount ?? Math.ceil(normalCount / 2) : normalCount;
}

//# sourceMappingURL=test-helpers.js.map