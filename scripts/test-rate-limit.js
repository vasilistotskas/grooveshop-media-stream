#!/usr/bin/env node

/**
 * Script to run the rate limit integration test with better error handling
 */

const { execSync } = require('child_process')
const path = require('path')

const testFile = 'src/test/RateLimit/integration/rate-limit.integration.spec.ts'
const testName = 'concurrent Requests should handle concurrent requests correctly'

console.log('Running rate limit integration test...')
console.log(`Test file: ${testFile}`)
console.log(`Test name: ${testName}`)

try {
	// Set environment variables for better test stability
	process.env.CI = 'true'
	process.env.NODE_ENV = 'test'
	process.env.REDIS_HOST = 'localhost'
	process.env.REDIS_PORT = '6379'

	// Run the specific test with Jest
	const command = `npx jest "${testFile}" --testNamePattern="${testName}" --verbose --detectOpenHandles --forceExit --maxWorkers=1`
	
	console.log(`Executing: ${command}`)
	
	const output = execSync(command, {
		cwd: process.cwd(),
		stdio: 'inherit',
		timeout: 60000 // 60 second timeout
	})
	
	console.log('Test completed successfully!')
	
} catch (error) {
	console.error('Test failed:', error.message)
	
	if (error.stdout) {
		console.log('STDOUT:', error.stdout.toString())
	}
	
	if (error.stderr) {
		console.error('STDERR:', error.stderr.toString())
	}
	
	process.exit(1)
}