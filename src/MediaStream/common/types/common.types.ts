/**
 * Common type definitions used across the MediaStream application
 */

/**
 * Loose bag of contextual data: error context, health-check details.
 */
export type Metadata = Record<string, any>

/**
 * Per-layer counts (cache layer hit distribution)
 */
export type LayerDistribution = Record<string, number>
