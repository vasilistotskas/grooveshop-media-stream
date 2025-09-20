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
exports.PerformanceTracker = void 0;
const process = __importStar(require("node:process"));
const correlation_service_1 = require("../services/correlation.service");
const logger_util_1 = require("./logger.util");
class PerformanceTracker {
    static getCorrelationService() {
        return new correlation_service_1.CorrelationService();
    }
    static startPhase(phaseName, metadata) {
        const correlationId = this.getCorrelationService().getCorrelationId();
        if (!correlationId)
            return;
        const phase = {
            name: phaseName,
            startTime: process.hrtime.bigint(),
            metadata,
        };
        if (!this.phases.has(correlationId)) {
            this.phases.set(correlationId, []);
        }
        this.phases.get(correlationId).push(phase);
        logger_util_1.CorrelatedLogger.debug(`Performance phase started: ${phaseName}${metadata ? ` (${JSON.stringify(metadata)})` : ''}`, 'PerformanceTracker');
    }
    static endPhase(phaseName, metadata) {
        const correlationId = this.getCorrelationService().getCorrelationId();
        if (!correlationId)
            return null;
        const phases = this.phases.get(correlationId);
        if (!phases)
            return null;
        const phase = phases
            .slice()
            .reverse()
            .find(p => p.name === phaseName && !p.endTime);
        if (!phase) {
            logger_util_1.CorrelatedLogger.warn(`Performance phase not found or already ended: ${phaseName}`, 'PerformanceTracker');
            return null;
        }
        phase.endTime = process.hrtime.bigint();
        phase.duration = Number(phase.endTime - phase.startTime) / 1_000_000;
        if (metadata) {
            phase.metadata = { ...phase.metadata, ...metadata };
        }
        const logLevel = phase.duration > 1000 ? 'warn' : 'debug';
        const logger = logLevel === 'warn' ? logger_util_1.CorrelatedLogger.warn : logger_util_1.CorrelatedLogger.debug;
        logger(`Performance phase completed: ${phaseName} - ${phase.duration.toFixed(2)}ms${phase.metadata ? ` (${JSON.stringify(phase.metadata)})` : ''}`, 'PerformanceTracker');
        return phase.duration;
    }
    static getPhases() {
        const correlationId = this.getCorrelationService().getCorrelationId();
        if (!correlationId)
            return [];
        return this.phases.get(correlationId) || [];
    }
    static getSummary() {
        const phases = this.getPhases();
        const completedPhases = phases.filter(p => p.duration !== undefined);
        const totalDuration = completedPhases.reduce((sum, p) => sum + (p.duration || 0), 0);
        const slowestPhase = completedPhases.reduce((slowest, current) => !slowest || (current.duration || 0) > (slowest.duration || 0) ? current : slowest, undefined);
        return {
            totalPhases: phases.length,
            completedPhases: completedPhases.length,
            totalDuration,
            slowestPhase,
            phases,
        };
    }
    static clearPhases() {
        const correlationId = this.getCorrelationService().getCorrelationId();
        if (correlationId) {
            this.phases.delete(correlationId);
        }
    }
    static async measure(phaseName, fn, metadata) {
        this.startPhase(phaseName, metadata);
        try {
            const result = await fn();
            this.endPhase(phaseName, { success: true });
            return result;
        }
        catch (error) {
            this.endPhase(phaseName, {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
    static measureMethod(phaseName, metadata) {
        return function (target, propertyName, descriptor) {
            const method = descriptor.value;
            const actualPhaseName = phaseName || `${target.constructor.name}.${propertyName}`;
            descriptor.value = async function (...args) {
                return PerformanceTracker.measure(actualPhaseName, () => method.apply(this, args), metadata);
            };
        };
    }
    static logSummary() {
        const summary = this.getSummary();
        if (summary.totalPhases === 0)
            return;
        const context = this.getCorrelationService().getContext();
        const requestDuration = context?.duration;
        logger_util_1.CorrelatedLogger.log(`Performance Summary: ${summary.completedPhases}/${summary.totalPhases} phases completed, `
            + `total phase time: ${summary.totalDuration.toFixed(2)}ms${requestDuration ? `, request time: ${requestDuration.toFixed(2)}ms` : ''}${summary.slowestPhase ? `, slowest: ${summary.slowestPhase.name} (${summary.slowestPhase.duration?.toFixed(2)}ms)` : ''}`, 'PerformanceTracker');
        this.clearPhases();
    }
}
exports.PerformanceTracker = PerformanceTracker;
PerformanceTracker.phases = new Map();
//# sourceMappingURL=performance-tracker.util.js.map