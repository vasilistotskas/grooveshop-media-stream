import * as process from 'node:process'

/**
 * The one place that reads NODE_ENV. Read per call — specs mutate it.
 */
export function nodeEnv(): string {
	return process.env.NODE_ENV ?? 'development'
}

export function isProduction(): boolean {
	return nodeEnv() === 'production'
}

export function isTest(): boolean {
	return nodeEnv() === 'test'
}
