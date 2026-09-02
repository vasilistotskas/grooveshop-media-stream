import { configDefaults, defineConfig } from 'vitest/config'

import config from '../../vitest.config.js'

/**
 * Performance specs assert wall-clock budgets, so they are excluded from the
 * default run and executed on demand via `pnpm run test:perf`.
 * Spread instead of mergeConfig: mergeConfig concatenates arrays, which would
 * extend the unit include/exclude rather than replace them.
 */
export default defineConfig({
	...config,
	test: {
		...config.test,
		include: ['src/test/performance/**/*.perf.spec.ts'],
		exclude: [...configDefaults.exclude],
		coverage: {
			...config.test?.coverage,
			enabled: false,
		},
	},
})
