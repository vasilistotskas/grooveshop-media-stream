/**
 * Common type definitions used across the MediaStream application
 * These types replace generic Record<string, T> with semantic, reusable types
 */

/**
 * Generic key-value map with string keys and any values
 * Use for flexible metadata, context objects, or configuration
 */
export type StringMap = Record<string, any>

/**
 * String-to-string mapping
 * Use for headers, tags, environment variables, or simple key-value pairs
 */
export type StringRecord = Record<string, string>

/**
 * Metadata object for additional contextual information
 * Use for error context, logging metadata, or extensible data structures
 */
export type Metadata = Record<string, any>

/**
 * Tags for categorization and filtering
 * Use for metric tags, alert tags, or resource labels
 */
export type Tags = Record<string, string>

/**
 * Metrics collection with numeric values
 * Use for performance metrics, health scores, or statistical data
 */
export type MetricsMap = Record<string, number>

/**
 * Configuration object with flexible structure
 * Use for API keys, integration configs, or dynamic settings
 */
export type ConfigMap = Record<string, string>

/**
 * Generic details object for health checks or status information
 * Use for health indicator details, diagnostic information, or status reports
 */
export type DetailsMap = Record<string, any>

/**
 * File type distribution or categorization
 * Use for counting file types, extensions, or categories
 */
export type FileTypeMap = Record<string, number>

/**
 * Layer statistics or distribution
 * Use for cache layer metrics, service layer stats, or hierarchical data
 */
export type LayerDistribution = Record<string, number>
