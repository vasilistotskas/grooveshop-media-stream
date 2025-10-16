// eslint.config.js
import antfu from '@antfu/eslint-config'
import vitest from '@vitest/eslint-plugin'

export default antfu({
	type: 'lib',
	stylistic: {
		indent: 'tab',
		quotes: 'single',
	},
	typescript: true,
}, {
	rules: {
		...vitest.configs.recommended.rules,
		'@typescript-eslint/consistent-type-imports': 'off',
		'no-console': 'off',
	},
})
