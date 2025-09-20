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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.gracefulShutdown = gracefulShutdown;
exports.createStaggeredRequests = createStaggeredRequests;
exports.getCIFriendlyCount = getCIFriendlyCount;
const process = __importStar(require("node:process"));
async function gracefulShutdown(app, delay = 100) {
    if (!app)
        return;
    await new Promise(resolve => setTimeout(resolve, delay));
    try {
        await app.close();
    }
    catch (error) {
        console.warn('Error during app shutdown:', error);
    }
}
function createStaggeredRequests(requestFactory, count, staggerMs = 10) {
    return Array.from({ length: count }, (_, i) => new Promise((resolve) => {
        setTimeout(() => {
            resolve(requestFactory(i));
        }, i * staggerMs);
    }));
}
function getCIFriendlyCount(normalCount, ciCount) {
    return process.env.CI ? (ciCount ?? Math.ceil(normalCount / 2)) : normalCount;
}
//# sourceMappingURL=test-helpers.js.map