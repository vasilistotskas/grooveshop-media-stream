import type { ConfigService } from '#microservice/Config/config.service'
import { vi } from 'vitest'
import { APP_CONFIG_SCHEMA, buildConfigFromSchema, setNestedValue } from '#microservice/common/utils/config-schema.util'

export type ConfigOverrides = Record<string, unknown>

const SCHEMA_PATHS = new Set(
	Object.keys(APP_CONFIG_SCHEMA).flatMap((path) => {
		const segments = path.split('.')
		return segments.map((_, index) => segments.slice(0, index + 1).join('.'))
	}),
)

/**
 * A `ConfigService` double whose `get()` mirrors production semantics: every
 * schema default is present, `overrides` (leaf or group paths) win, group
 * reads return objects, and unknown keys throw like the real service.
 */
export function createConfigServiceMock(overrides: ConfigOverrides = {}): ConfigService {
	const config = buildConfigFromSchema<Record<string, any>>(() => undefined, APP_CONFIG_SCHEMA)
	for (const [path, value] of Object.entries(overrides)) {
		setNestedValue(config, path, value)
	}

	const get = vi.fn((key: string) => {
		const value = key.split('.').reduce<any>((current, segment) => current?.[segment], config)
		if (value === undefined && !SCHEMA_PATHS.has(key) && !(key in overrides)) {
			throw new Error(`Configuration key '${key}' not found`)
		}
		return value
	})

	return { get } as unknown as ConfigService
}
