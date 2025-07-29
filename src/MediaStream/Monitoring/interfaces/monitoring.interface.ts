export interface CustomMetric {
	name: string
	value: number
	timestamp: number
	tags?: Record<string, string>
	type: MetricType
}

export enum MetricType {
	COUNTER = 'counter',
	GAUGE = 'gauge',
	HISTOGRAM = 'histogram',
	TIMER = 'timer',
}

export interface AlertRule {
	id: string
	name: string
	description: string
	metric: string
	condition: AlertCondition
	threshold: number
	severity: AlertSeverity
	enabled: boolean
	cooldownMs: number
	tags?: Record<string, string>
}

export enum AlertCondition {
	GREATER_THAN = 'gt',
	LESS_THAN = 'lt',
	EQUALS = 'eq',
	NOT_EQUALS = 'ne',
	GREATER_THAN_OR_EQUAL = 'gte',
	LESS_THAN_OR_EQUAL = 'lte',
}

export enum AlertSeverity {
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
	CRITICAL = 'critical',
}

export interface Alert {
	id: string
	ruleId: string
	ruleName: string
	message: string
	severity: AlertSeverity
	timestamp: number
	resolved: boolean
	resolvedAt?: number
	metadata?: Record<string, any>
}

export interface PerformanceMetrics {
	operationName: string
	duration: number
	timestamp: number
	success: boolean
	errorMessage?: string
	metadata?: Record<string, any>
}

export interface SystemHealth {
	status: 'healthy' | 'degraded' | 'unhealthy'
	timestamp: number
	components: ComponentHealth[]
	overallScore: number
}

export interface ComponentHealth {
	name: string
	status: 'healthy' | 'degraded' | 'unhealthy'
	score: number
	metrics: Record<string, number>
	lastCheck: number
}

export interface MonitoringConfig {
	enabled: boolean
	metricsRetentionMs: number
	alertsRetentionMs: number
	performanceRetentionMs: number
	healthCheckIntervalMs: number
	alertCooldownMs: number
	externalIntegrations: {
		enabled: boolean
		endpoints: string[]
		apiKeys?: Record<string, string>
	}
}
