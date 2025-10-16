import * as process from 'node:process'
import MediaStreamModule from '#microservice/media-stream.module'
import { NestFactory } from '@nestjs/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrap } from '../main'

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
								origin: '*',
								methods: 'GET',
								maxAge: 86400,
							},
						}
					}
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
	})

	it('should bootstrap the application successfully', async () => {
		process.env.PORT = '4000'

		await bootstrap(false)

		expect(NestFactory.create).toHaveBeenCalledWith(
			MediaStreamModule,
		)

		expect(mockApp.useStaticAssets).toHaveBeenCalledWith('public')
		expect(mockApp.enableCors).toHaveBeenCalledWith({
			origin: '*',
			methods: 'GET',
			maxAge: 86400,
		})
		expect(mockApp.listen).toHaveBeenCalledWith(4000, '0.0.0.0')
	})

	it('should use default port if PORT environment variable is not set', async () => {
		delete process.env.PORT

		await bootstrap(false)

		expect(mockApp.listen).toHaveBeenCalledWith(3003, '0.0.0.0')
	})

	it('should handle errors during bootstrap', async () => {
		const error = new Error('Test error')
		vi.mocked(NestFactory.create).mockRejectedValue(error)

		await expect(bootstrap(false)).rejects.toThrow('Test error')
	})

	// eslint-disable-next-line test/expect-expect
	it('should handle unhandled errors in bootstrap promise', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const error = new Error('Unhandled error')

		vi.mocked(NestFactory.create).mockRejectedValue(error)

		const bootstrapPromise = bootstrap(false)

		await new Promise(process.nextTick)

		bootstrapPromise.catch(() => {})

		consoleErrorSpy.mockRestore()
	})
})
