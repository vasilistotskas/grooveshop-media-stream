import { fileURLToPath, URL } from 'node:url'
import swc from 'unplugin-swc'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/test/**/*.spec.ts'],
		// Performance specs assert wall-clock budgets; they run via `pnpm run test:perf`.
		exclude: [...configDefaults.exclude, 'src/test/performance/**'],
		env: {
			NODE_ENV: 'test',
		},
		coverage: {
			// Off by default so a single-file run is not gated by the global floors;
			// `pnpm run test:coverage` turns it on.
			enabled: false,
			provider: 'v8',
			reportsDirectory: fileURLToPath(new URL('./coverage', import.meta.url)),
			reporter: ['text', 'html', 'clover', 'lcov', 'json', 'json-summary'],
			// Application sources only — test files and config must not dilute
			// (or pad) the coverage denominators.
			include: ['src/MediaStream/**/*.ts', 'src/main.ts'],
			exclude: [
				'**/build/**/*',
				'**/dist/**/*',
				'**/node_modules/**/*',
				'**/.cache/**/*',
			],
			// Floors sit ~2 points under the measured baseline so regressions
			// fail CI while normal churn does not. Raise them as coverage grows.
			thresholds: {
				statements: 87,
				branches: 79,
				functions: 86,
				lines: 88,
			},
			clean: true,
			cleanOnRerun: true,
		},
		globals: true,
		environment: 'node',
		setupFiles: ['./src/test/setup.ts'],
		root: './',
		testTimeout: 30_000,
		hookTimeout: 30_000,
		isolate: true,
		fileParallelism: true,
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
