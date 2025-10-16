import { fileURLToPath, URL } from 'node:url'
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			enabled: true,
			provider: 'v8',
			reportsDirectory: fileURLToPath(new URL('./coverage', import.meta.url)),
			reporter: ['text', 'html', 'clover', 'lcov', 'json'],
			include: ['**/*.ts', '**/*.vue'],
			exclude: [
				'**/build/**/*',
				'**/dist/**/*',
				'**/node_modules/**/*',
				'**/.cache/**/*',
			],
			clean: true,
			cleanOnRerun: true,
		},
		globals: true,
		environment: 'node',
		setupFiles: ['./src/test/setup.ts'],
		root: './',
		testTimeout: 30_000,
	},
	resolve: {
		alias: {
			'@microservice': fileURLToPath(new URL('./src/MediaStream', import.meta.url)),
			'@storage': fileURLToPath(new URL('./var', import.meta.url)),
		},
	},
	plugins: [
		swc.vite({
			module: { type: 'es6' },
		}),
	],
})
