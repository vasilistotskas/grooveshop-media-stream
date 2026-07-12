import type { OnModuleInit } from '@nestjs/common'
import type { AppConfig } from './interfaces/app-config.interface.js'
import * as process from 'node:process'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { APP_CONFIG_SCHEMA, buildConfigFromSchema } from '#microservice/common/utils/config-schema.util'

@Injectable()
export class ConfigService implements OnModuleInit {
	private readonly _logger = new Logger(ConfigService.name)
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
		this._logger.log('Configuration loaded and validated successfully')
	}

	/**
	 * Get a configuration value by key with type safety
	 */
	get<T = any>(key: string): T {
		const keys = key.split('.')
		let value: any = this.config

		for (const k of keys) {
			value = value?.[k]
		}

		if (value === undefined) {
			throw new Error(`Configuration key '${key}' not found`)
		}

		// Ensure boolean values are properly typed
		return this.ensureProperType(value) as T
	}

	/**
	 * Get an optional configuration value with default fallback
	 */
	getOptional<T = any>(key: string, defaultValue?: T): T {
		try {
			const value = this.get<T>(key)
			// Ensure boolean values are properly typed
			return this.ensureProperType(value) as T
		}
		catch {
			return defaultValue as T
		}
	}

	/**
	 * Ensure configuration values are properly typed
	 * This is critical for boolean values which can be strings from environment variables
	 */
	private ensureProperType<T>(value: any): T {
		// If it's a string that looks like a boolean, convert it
		if (typeof value === 'string') {
			const lowerValue = value.toLowerCase()
			if (lowerValue === 'true') {
				return true as T
			}
			if (lowerValue === 'false') {
				return false as T
			}
		}
		return value as T
	}

	/**
	 * Get the entire configuration object
	 */
	getAll(): AppConfig {
		return { ...this.config }
	}

	/**
	 * Validate the effective (schema-built) configuration against the DTO
	 * constraints. Runs on the same object served by get()/getOptional(), so
	 * what is validated is exactly what the application consumes.
	 */
	async validate(): Promise<void> {
		const { plainToInstance } = await import('class-transformer')
		const { validate } = await import('class-validator')
		const { AppConfigDto } = await import('#microservice/Config/dto/app-config.dto')

		const dto = plainToInstance(AppConfigDto, this.config, {
			enableImplicitConversion: true,
			excludeExtraneousValues: false,
		})
		const errors = await validate(dto, {
			whitelist: false,
			forbidNonWhitelisted: false,
		})

		if (errors.length > 0) {
			const extractMessages = (errs: typeof errors, prefix = ''): string[] => {
				const messages: string[] = []
				for (const error of errs) {
					const prop = prefix ? `${prefix}.${error.property}` : error.property
					if (error.constraints) {
						messages.push(...Object.values(error.constraints).map(msg => `${prop}: ${msg}`))
					}
					if (error.children?.length) {
						messages.push(...extractMessages(error.children, prop))
					}
				}
				return messages
			}
			const errorMessages = extractMessages(errors).join('; ')
			throw new Error(`Configuration validation failed: ${errorMessages}`)
		}

		// In production, an empty CORS origin is a misconfiguration — a wildcard
		// origin was removed and must be replaced with an explicit allow-list.
		// Fail fast at startup rather than silently serving with broken CORS.
		if (process.env.NODE_ENV === 'production') {
			const corsOrigin = this.nestConfigService.get<string>('CORS_ORIGIN') || ''
			if (!corsOrigin.trim()) {
				throw new Error(
					'Configuration error: CORS_ORIGIN must be set in production. '
					+ 'Set it to the allowed origin(s) for this service (e.g. https://webside.gr).',
				)
			}
		}

		this._logger.log('Configuration validation passed')
	}
}
