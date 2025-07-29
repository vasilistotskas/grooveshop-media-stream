# Advanced Monitoring and Alerting System

## Overview

The Advanced Monitoring and Alerting System provides comprehensive monitoring capabilities for the Grooveshop Media Stream service. It includes real-time metrics collection, intelligent alerting, performance monitoring, and system health tracking.

## Features

### 1. Custom Metrics Collection
- **Counter Metrics**: Track incremental values (requests, errors, cache hits)
- **Gauge Metrics**: Track current values (memory usage, active connections)
- **Histogram Metrics**: Track distribution of values (response sizes, processing times)
- **Timer Metrics**: Track operation durations

### 2. Intelligent Alerting System
- **Configurable Alert Rules**: Define custom thresholds and conditions
- **Multiple Severity Levels**: LOW, MEDIUM, HIGH, CRITICAL
- **Alert Conditions**: Greater than, less than, equals, not equals, etc.
- **Cooldown Periods**: Prevent alert spam
- **Alert History**: Track alert lifecycle and resolution times

### 3. Performance Monitoring
- **Operation Tracking**: Monitor duration and success rates of operations
- **Percentile Calculations**: P50, P95, P99 response times
- **Active Operation Monitoring**: Track long-running operations
- **Performance Statistics**: Success rates, error rates, average durations

### 4. System Health Monitoring
- **Component Health**: Memory, disk, network, cache health indicators
- **Overall Health Score**: Aggregated system health rating
- **Health Status**: Healthy, degraded, unhealthy classifications
- **Real-time Health Checks**: Continuous system monitoring

## API Endpoints

### Health and Dashboard
```
GET /monitoring/health              # System health overview
GET /monitoring/dashboard           # Complete monitoring dashboard
GET /monitoring/stats               # Monitoring statistics
```

### Metrics
```
GET /monitoring/metrics             # List all metric names
GET /monitoring/metrics/:name       # Get specific metric data
GET /monitoring/metrics/:name?aggregated=true  # Get aggregated metrics
```

### Alerts
```
GET /monitoring/alerts/rules        # Get alert rules
POST /monitoring/alerts/rules       # Add/update alert rule
GET /monitoring/alerts/active       # Get active alerts
GET /monitoring/alerts/history      # Get alert history
POST /monitoring/alerts/trigger     # Trigger manual alert
POST /monitoring/alerts/:id/resolve # Resolve alert
```

### Performance
```
GET /monitoring/performance         # Get tracked operations
GET /monitoring/performance/overview # Performance overview
GET /monitoring/performance/:name   # Get operation metrics
GET /monitoring/performance/:name?stats=true # Get operation statistics
```

## Usage Examples

### Recording Metrics

```typescript
import { MonitoringService } from '@microservice/Monitoring/services/monitoring.service'

// Inject the service
constructor(private readonly monitoringService: MonitoringService) {}

// Record different types of metrics
this.monitoringService.incrementCounter('api.requests.total')
this.monitoringService.recordGauge('system.memory.usage', 75.5)
this.monitoringService.recordTimer('image.processing.duration', 1500)
this.monitoringService.recordHistogram('response.size.bytes', 2048)
```

### Performance Tracking

```typescript
import { PerformanceMonitoringService } from '@microservice/Monitoring/services/performance-monitoring.service'

// Track synchronous operations
const result = this.performanceService.trackOperation('image-resize', () => {
    return this.resizeImage(image, dimensions)
}, { imageSize: '1024x768' })

// Track asynchronous operations
const result = await this.performanceService.trackAsyncOperation('external-api-call', async () => {
    return await this.httpService.get('/api/data')
}, { endpoint: '/api/data' })

// Manual operation tracking
const operationId = this.performanceService.startOperation('long-running-task')
try {
    // ... perform operation
    this.performanceService.endOperation(operationId, true)
} catch (error) {
    this.performanceService.endOperation(operationId, false, error.message)
}
```

### Alert Management

```typescript
import { AlertService } from '@microservice/Monitoring/services/alert.service'

// Add alert rule
this.alertService.addAlertRule({
    id: 'high-memory-usage',
    name: 'High Memory Usage',
    description: 'Memory usage is above 85%',
    metric: 'system.memory.usage',
    condition: AlertCondition.GREATER_THAN,
    threshold: 85,
    severity: AlertSeverity.HIGH,
    enabled: true,
    cooldownMs: 300000 // 5 minutes
})

// Trigger manual alert
this.alertService.triggerAlert(
    'Manual Intervention Required',
    'System requires manual attention',
    AlertSeverity.CRITICAL,
    { source: 'admin-panel' }
)

// Get active alerts
const activeAlerts = this.alertService.getActiveAlerts()

// Resolve alert
this.alertService.resolveAlert('alert-id-123')
```

## Configuration

The monitoring system can be configured through environment variables or the configuration service:

```typescript
{
  monitoring: {
    enabled: true,                          // Enable/disable monitoring
    metricsRetentionMs: 24 * 60 * 60 * 1000,  // 24 hours
    alertsRetentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    performanceRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
    healthCheckIntervalMs: 30 * 1000,       // 30 seconds
    alertCooldownMs: 5 * 60 * 1000,         // 5 minutes
    externalIntegrations: {
      enabled: false,
      endpoints: [],
      apiKeys: {}
    }
  }
}
```

## Default Alert Rules

The system comes with several pre-configured alert rules:

1. **High Memory Usage** (85% threshold, HIGH severity)
2. **Critical Memory Usage** (95% threshold, CRITICAL severity)
3. **Low Cache Hit Rate** (70% threshold, MEDIUM severity)
4. **High Error Rate** (5% threshold, HIGH severity)
5. **Slow Response Time** (2000ms threshold, MEDIUM severity)

## Health Indicators

The system includes specialized health indicators:

### SystemHealthIndicator
- Monitors overall system health
- Checks memory, disk, network, and cache components
- Provides aggregated health score

### AlertingHealthIndicator
- Monitors alerting system health
- Checks for critical alerts
- Validates alert rule configuration

## Integration with Existing Systems

### Correlation IDs
All monitoring activities are automatically tagged with correlation IDs for request tracing.

### Metrics Service
The monitoring system integrates with the existing metrics service for Prometheus export.

### Health Checks
System health indicators are integrated with NestJS Terminus health checks.

## Performance Considerations

- **Memory Management**: Automatic cleanup of old metrics and alerts
- **Configurable Retention**: Adjust retention periods based on needs
- **Efficient Storage**: In-memory storage with size limits
- **Background Processing**: Non-blocking metric collection and alert evaluation

## Troubleshooting

### Common Issues

1. **High Memory Usage**: Reduce retention periods or increase cleanup frequency
2. **Missing Alerts**: Check alert rule configuration and metric names
3. **Performance Impact**: Disable monitoring in development if needed
4. **Alert Spam**: Increase cooldown periods for noisy alerts

### Debug Information

```typescript
// Get monitoring statistics
const stats = monitoringService.getStats()
console.log('Total metrics:', stats.totalMetrics)
console.log('Memory usage:', stats.memoryUsage)

// Get alert statistics
const alertStats = alertService.getAlertStats()
console.log('Active alerts:', alertStats.activeAlerts)
console.log('Alert rules:', alertStats.totalRules)

// Get performance overview
const perfOverview = performanceService.getPerformanceOverview()
console.log('Total operations:', perfOverview.totalOperations)
console.log('Success rate:', perfOverview.successRate)
```

## Future Enhancements

- **External Integrations**: Webhook support for external monitoring systems
- **Advanced Analytics**: Machine learning-based anomaly detection
- **Custom Dashboards**: Web-based monitoring dashboard
- **Distributed Tracing**: Integration with OpenTelemetry
- **Metric Aggregation**: Time-series database integration

## Testing

The monitoring system includes comprehensive tests:

- **Unit Tests**: Individual service and component testing
- **Integration Tests**: End-to-end monitoring workflow testing
- **Performance Tests**: Load testing for metric collection
- **Health Check Tests**: Validation of health indicators

Run tests with:
```bash
pnpm test Monitoring
pnpm test:e2e monitoring
```