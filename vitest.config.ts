import { fileURLToPath, URL } from 'node:url'
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			enabled: true,
			provider: 'v8',
			reportsDirectory: fileURLToPath(new URL('./coverage', import.meta.url)),
			reporter: ['text', 'html', 'clover', 'lcov', 'json', 'json-summary'],
			// Application sources only — test files and config must not dilute
			// (or pad) the coverage denominators.
			include: ['src/MediaStream/**/*.ts'],
			exclude: [
				'**/build/**/*',
				'**/dist/**/*',
				'**/node_modules/**/*',
				'**/.cache/**/*',
			],
			// Floors sit ~2 points under the measured baseline so regressions
			// fail CI while normal churn does not. Raise them as coverage grows.
			thresholds: {
				statements: 78,
				branches: 66,
				functions: 80,
				lines: 78,
			},
			clean: true,
			cleanOnRerun: true,
		},
		exclude: [
			'**/build/**/*',
			'**/dist/**/*',
			'**/node_modules/**/*',
			'**/.cache/**/*',
		],
		globals: true,
		environment: 'node',
		setupFiles: ['./src/test/setup.ts'],
		root: './',
		testTimeout: 30_000,
		isolate: true,
		fileParallelism: false,
	},
	resolve: {
		alias: {
			'#microservice': fileURLToPath(new URL('./src/MediaStream', import.meta.url)),
		},
	},
	plugins: [
		swc.vite({
			module: { type: 'es6' },
		}),
	],
})
