import type { Config } from 'jest'

export default async (): Promise<Config> => {
	return {
		verbose: true,
		setupFiles: ['<rootDir>/../.jest/setEnvVars.ts'],
		moduleFileExtensions: ['js', 'json', 'ts'],
		rootDir: 'src',
		testRegex: '.*\\.spec\\.ts$',
		transform: {
			'^.+\\.(t|j)s$': 'ts-jest'
		},
		collectCoverageFrom: ['**/*.(t|j)s', '!**/*.d.ts', '!**/node_modules/**'],
		coverageDirectory: '../coverage',
		testEnvironment: 'node',
		testTimeout: 30000, // 30 seconds for integration tests
		moduleNameMapper: {
			'^@/(.*)$': '<rootDir>/$1',
			'^@microservice/(.*)$': '<rootDir>/MediaStream/$1'
		},
		// Reduce concurrency in CI
		maxWorkers: process.env.CI ? 2 : '50%'
	}
}
