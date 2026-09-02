import type { OnModuleInit } from '@nestjs/common'
import type { ValidationError } from 'class-validator'
import type { AppConfig } from './interfaces/app-config.interface.js'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { APP_CONFIG_SCHEMA, buildConfigFromSchema } from '#microservice/common/utils/config-schema.util'
import { isProduction } from '#microservice/common/utils/runtime-env.util'
import { AppConfigDto } from './dto/app-config.dto.js'

/** Every dotted path that can be read: schema leaves plus all their ancestors. */
const SCHEMA_PATHS: ReadonlySet<string> = new Set(
	Object.keys(APP_CONFIG_SCHEMA).flatMap((path) => {
		const segments = path.split('.')
		return segments.map((_, index) => segments.slice(0, index + 1).join('.'))
	}),
)

function collectMessages(errors: ValidationError[], prefix = ''): string[] {
	return errors.flatMap((error) => {
		const property = prefix ? `${prefix}.${error.property}` : error.property
		const own = Object.values(error.constraints ?? {}).map(message => `${property}: ${message}`)
		return [...own, ...collectMessages(error.children ?? [], property)]
	})
}

@Injectable()
export class ConfigService implements OnModuleInit {
	private readonly logger = new Logger(ConfigService.name)
	private readonly config: AppConfig

	constructor(private readonly nestConfigService: NestConfigService) {
		// APP_CONFIG_SCHEMA is the single source of truth for the config shape:
		// every key, env-var mapping, and default lives there.
		this.config = buildConfigFromSchema<AppConfig>(
			(key: string) => this.nestConfigService.get(key),
			APP_CONFIG_SCHEMA,
		)
	}

	async onModuleInit(): Promise<void> {
		await this.validate()
		this.logger.log('Configuration loaded and validated successfully')
	}

	/**
	 * Read a value (or a whole group) by dotted path. Every path comes from
	 * APP_CONFIG_SCHEMA, so an unknown path is a programming error rather than
	 * a missing env var. The only schema value that can legitimately be
	 * `undefined` is `cache.redis.password`.
	 */
	get<T = any>(key: string): T {
		let value: any = this.config
		for (const segment of key.split('.')) {
			value = value?.[segment]
		}

		if (value === undefined && !SCHEMA_PATHS.has(key)) {
			throw new Error(`Configuration key '${key}' not found`)
		}

		return value as T
	}

	/**
	 * Validate the schema-built configuration against the DTO constraints. The
	 * DTO carries no defaults, so this also proves the schema produced every
	 * declared field.
	 */
	async validate(): Promise<void> {
		const dto = plainToInstance(AppConfigDto, this.config)
		const errors = await validate(dto)

		if (errors.length > 0) {
			throw new Error(`Configuration validation failed: ${collectMessages(errors).join('; ')}`)
		}

		if (isProduction()) {
			// A wildcard origin is a development convenience, never a production
			// setting; fail fast rather than serve with broken CORS.
			const origin = this.config.server.cors.origin.trim()
			if (!origin || origin === '*') {
				throw new Error(
					'Configuration error: CORS_ORIGIN must be an explicit origin allow-list in production (e.g. https://store.example.com).',
				)
			}

			if (!this.config.backend.url.trim()) {
				throw new Error('Configuration error: BACKEND_URL must be set in production.')
			}
		}

		this.logger.log('Configuration validation passed')
	}
}
