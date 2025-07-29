"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertSeverity = exports.AlertCondition = exports.MetricType = void 0;
var MetricType;
(function (MetricType) {
    MetricType["COUNTER"] = "counter";
    MetricType["GAUGE"] = "gauge";
    MetricType["HISTOGRAM"] = "histogram";
    MetricType["TIMER"] = "timer";
})(MetricType || (exports.MetricType = MetricType = {}));
var AlertCondition;
(function (AlertCondition) {
    AlertCondition["GREATER_THAN"] = "gt";
    AlertCondition["LESS_THAN"] = "lt";
    AlertCondition["EQUALS"] = "eq";
    AlertCondition["NOT_EQUALS"] = "ne";
    AlertCondition["GREATER_THAN_OR_EQUAL"] = "gte";
    AlertCondition["LESS_THAN_OR_EQUAL"] = "lte";
})(AlertCondition || (exports.AlertCondition = AlertCondition = {}));
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["LOW"] = "low";
    AlertSeverity["MEDIUM"] = "medium";
    AlertSeverity["HIGH"] = "high";
    AlertSeverity["CRITICAL"] = "critical";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
//# sourceMappingURL=monitoring.interface.js.map