export var MetricType = /*#__PURE__*/ function(MetricType) {
    MetricType["COUNTER"] = "counter";
    MetricType["GAUGE"] = "gauge";
    MetricType["HISTOGRAM"] = "histogram";
    MetricType["TIMER"] = "timer";
    return MetricType;
}({});
export var AlertCondition = /*#__PURE__*/ function(AlertCondition) {
    AlertCondition["GREATER_THAN"] = "gt";
    AlertCondition["LESS_THAN"] = "lt";
    AlertCondition["EQUALS"] = "eq";
    AlertCondition["NOT_EQUALS"] = "ne";
    AlertCondition["GREATER_THAN_OR_EQUAL"] = "gte";
    AlertCondition["LESS_THAN_OR_EQUAL"] = "lte";
    return AlertCondition;
}({});
export var AlertSeverity = /*#__PURE__*/ function(AlertSeverity) {
    AlertSeverity["LOW"] = "low";
    AlertSeverity["MEDIUM"] = "medium";
    AlertSeverity["HIGH"] = "high";
    AlertSeverity["CRITICAL"] = "critical";
    return AlertSeverity;
}({});

//# sourceMappingURL=monitoring.interface.js.map