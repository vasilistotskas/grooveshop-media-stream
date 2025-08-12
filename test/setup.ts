import * as process from 'node:process'
// Global test setup for E2E tests

beforeAll(async () => {
	// Set test environment variables
	process.env.NODE_ENV = 'test'
	process.env.REDIS_HOST = 'localhost'
	process.env.REDIS_PORT = '6379'
})

afterAll(async () => {
	// Force close any remaining connections
	await new Promise(resolve => setTimeout(resolve, 100))
})
