import { defineConfig } from 'vitest/config'

import config from '../../vitest.config.js'

// Spread instead of mergeConfig: mergeConfig concatenates arrays, which would
// extend the unit `include` rather than replace it.
export default defineConfig({
	...config,
	test: {
		...config.test,
		include: ['src/test/e2e/**/*.e2e-spec.ts'],
		// Coverage (and its thresholds) is measured by the unit suite; a
		// handful of e2e endpoints can never meet the global floors.
		coverage: {
			...config.test?.coverage,
			enabled: false,
		},
	},
})
