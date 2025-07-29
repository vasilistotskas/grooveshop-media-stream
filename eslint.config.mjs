// eslint.config.js
import antfu from '@antfu/eslint-config'

export default antfu({
	type: 'lib',
	stylistic: {
		indent: 'tab',
		quotes: 'single',
	},
	typescript: true,
}, {
	rules: {
		'@typescript-eslint/consistent-type-imports': 'off',
		'no-console': 'off',
	},
})
