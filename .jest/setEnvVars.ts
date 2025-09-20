import 'reflect-metadata'

process.env.NODE_ENV = 'test'

// Set CI-friendly timeouts and limits
if (process.env.CI) {
	// Increase timeouts in CI environment
	jest.setTimeout(30000)
	
	// Set environment variables for more conservative behavior in CI
	process.env.TEST_TIMEOUT = '30000'
	process.env.HTTP_TIMEOUT = '10000'
}
