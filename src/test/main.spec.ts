import * as process from 'node:process'
import { ConsoleLogger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MediaStreamModule from '#microservice/media-stream.module'
import { bootstrap } from '../main.js'

vi.mock('@nestjs/core', async () => {
	const actual = await vi.importActual('@nestjs/core')
	return {
		...actual,
		NestFactory: {
			create: vi.fn(),
		},
	}
})

describe('bootstrap', () => {
	let mockApp: any
	let originalEnv: NodeJS.ProcessEnv

	beforeEach(() => {
		originalEnv = { ...process.env }

		mockApp = {
			use: vi.fn().mockReturnThis(),
			set: vi.fn().mockReturnThis(),
			useStaticAssets: vi.fn().mockReturnThis(),
			enableCors: vi.fn().mockReturnThis(),
			listen: vi.fn().mockImplementation(() => Promise.resolve()),
			get: vi.fn().mockReturnValue({
				get: vi.fn().mockImplementation((key: any) => {
					if (key === 'server') {
						return {
							port: Number.parseInt(process.env.PORT || '3003'),
							host: '0.0.0.0',
							cors: {
								origin: ['*'],
								methods: 'GET',
								maxAge: 86400,
							},
						}
					}
					if (key === 'shutdown.timeout')
						return 30000
					if (key === 'shutdown.forceTimeout')
						return 60000
					return undefined
				}),
			}),
		}

		;(NestFactory.create as any).mockResolvedValue(mockApp)

		vi.resetModules()
	})

	afterEach(() => {
		Object.assign(process.env, originalEnv)

		vi.clearAllMocks()
		vi.unstubAllEnvs()
	})

	it('should bootstrap the application successfully', async () => {
		process.env.PORT = '4000'

		await bootstrap({ exitProcess: false, enableGracefulShutdown: false })

		expect(NestFactory.create).toHaveBeenCalledWith(
			MediaStreamModule,
			expect.objectContaining({ logger: expect.any(ConsoleLogger) }),
		)

		expect(mockApp.useStaticAssets).toHaveBeenCalledWith('public')
		expect(mockApp.enableCors).toHaveBeenCalledWith({
			origin: '*',
			methods: 'GET',
			maxAge: 86400,
		})
		expect(mockApp.listen).toHaveBeenCalledWith(4000, '0.0.0.0')
	})

	/** Bootstrap, then capture one line written by the logger handed to Nest. */
	async function firstLogLine(nodeEnv: string): Promise<string> {
		vi.stubEnv('NODE_ENV', nodeEnv)
		await bootstrap({ exitProcess: false, enableGracefulShutdown: false })
		const options = vi.mocked(NestFactory.create).mock.calls[0][1] as unknown as { logger: ConsoleLogger }
		const { logger } = options

		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		try {
			logger.log('image served', 'ImageStreamService')
			return String(write.mock.calls[0][0])
		}
		finally {
			write.mockRestore()
		}
	}

	it('should log one JSON object per line in production', async () => {
		const line = JSON.parse(await firstLogLine('production'))

		expect(line).toMatchObject({ level: 'log', context: 'ImageStreamService', message: 'image served' })
	})

	it('should keep the human-readable format outside production', async () => {
		const line = await firstLogLine('development')

		expect(() => JSON.parse(line)).toThrow()
		expect(line).toContain('image served')
	})

	// The shape VictoriaLogs indexes as log.<field>: flat, next to Nest's own keys.
	it('should put the fields of a structured event at the top level of the production line', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		await bootstrap({ exitProcess: false, enableGracefulShutdown: false })
		const { logger } = vi.mocked(NestFactory.create).mock.calls[0][1] as unknown as { logger: ConsoleLogger }

		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		try {
			logger.warn('image rejected 200 12ms', { correlation_id: 'c-1', schema: 'webside', input_bytes: 3_000_000, level: 'spoofed' }, 'ImageRequest')
			const line = JSON.parse(String(write.mock.calls[0][0]))

			expect(line).toMatchObject({ level: 'warn', context: 'ImageRequest', message: 'image rejected 200 12ms', correlation_id: 'c-1', schema: 'webside', input_bytes: 3_000_000 })
			expect(line.params).toBeUndefined()
		}
		finally {
			write.mockRestore()
		}
	})

	it('should use default port if PORT environment variable is not set', async () => {
		delete process.env.PORT

		await bootstrap({ exitProcess: false, enableGracefulShutdown: false })

		expect(mockApp.listen).toHaveBeenCalledWith(3003, '0.0.0.0')
	})

	it('should handle errors during bootstrap', async () => {
		const error = new Error('Test error')
		vi.mocked(NestFactory.create).mockRejectedValue(error)

		await expect(bootstrap({ exitProcess: false, enableGracefulShutdown: false })).rejects.toThrow('Test error')
	})

	// eslint-disable-next-line test/expect-expect
	it('should handle unhandled errors in bootstrap promise', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const error = new Error('Unhandled error')

		vi.mocked(NestFactory.create).mockRejectedValue(error)

		const bootstrapPromise = bootstrap({ exitProcess: false, enableGracefulShutdown: false })

		await new Promise(process.nextTick)

		bootstrapPromise.catch(() => {})

		consoleErrorSpy.mockRestore()
	})
})
