import { defineConfig, mergeConfig } from 'vitest/config'

import config from '../../vitest.config.js'

export default mergeConfig(
	config,
	defineConfig({
		test: {
			include: ['src/test/e2e/**/*.e2e-spec.ts'],
		},
	}),
	true,
)
