import * as process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import { NestFactory } from '@nestjs/core'
import { bootstrap } from '../main'

jest.mock('@nestjs/core', () => ({
	NestFactory: {
		create: jest.fn(),
	},
}))

describe('Bootstrap', () => {
	let mockApp: any
	let originalEnv: NodeJS.ProcessEnv

	beforeEach(() => {
		originalEnv = { ...process.env }

		mockApp = {
			useStaticAssets: jest.fn().mockReturnThis(),
			enableCors: jest.fn().mockReturnThis(),
			listen: jest.fn().mockImplementation(() => Promise.resolve()),
		}

		jest.mocked(NestFactory.create).mockResolvedValue(mockApp)

		jest.resetModules()
	})

	afterEach(() => {
		Object.assign(process.env, originalEnv)

		jest.clearAllMocks()
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
		expect(mockApp.listen).toHaveBeenCalledWith('4000')
	})

	it('should use default port if PORT environment variable is not set', async () => {
		delete process.env.PORT

		await bootstrap(false)

		expect(mockApp.listen).toHaveBeenCalledWith(3003)
	})

	it('should handle errors during bootstrap', async () => {
		const error = new Error('Test error')
		jest.mocked(NestFactory.create).mockRejectedValue(error)

		await expect(bootstrap(false)).rejects.toThrow('Test error')
	})

	it('should handle unhandled errors in bootstrap promise', async () => {
		const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

		const error = new Error('Unhandled error')
		jest.mocked(NestFactory.create).mockRejectedValue(error)

		const bootstrapPromise = bootstrap(false)

		await new Promise(process.nextTick)

		bootstrapPromise.catch(() => {})

		consoleErrorSpy.mockRestore()
	})
})
