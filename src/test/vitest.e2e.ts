import { defineConfig, mergeConfig } from 'vitest/config'

import config from '../../vitest.config.js'

export default mergeConfig(
	config,
	defineConfig({
		test: {
			include: ['src/test/e2e/**/*.e2e-spec.ts'],
			// Coverage (and its thresholds) is measured by the unit suite; a
			// handful of e2e endpoints can never meet the global floors.
			coverage: {
				enabled: false,
			},
		},
	}),
	true,
)
