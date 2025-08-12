#!/usr/bin/env node

/**
 * Script to run the rate limit integration tests simulating CI environment
 */

const { execSync } = require('child_process')

console.log('Running rate limit integration tests in CI simulation mode...')

try {
	// Set CI environment variable
	process.env.CI = 'true'
	process.env.NODE_ENV = 'test'
	process.env.REDIS_HOST = 'localhost'
	process.env.REDIS_PORT = '6379'

	// Run all rate limit tests with CI settings
	const command = `npx jest "src/test/RateLimit/integration/rate-limit.integration.spec.ts" --verbose --maxWorkers=1 --forceExit`
	
	console.log(`Executing: ${command}`)
	console.log('CI environment: true')
	
	const output = execSync(command, {
		cwd: process.cwd(),
		stdio: 'inherit',
		timeout: 120000 // 2 minute timeout
	})
	
	console.log('All tests completed successfully in CI simulation!')
	
} catch (error) {
	console.error('Tests failed in CI simulation:', error.message)
	
	if (error.stdout) {
		console.log('STDOUT:', error.stdout.toString())
	}
	
	if (error.stderr) {
		console.error('STDERR:', error.stderr.toString())
	}
	
	process.exit(1)
}