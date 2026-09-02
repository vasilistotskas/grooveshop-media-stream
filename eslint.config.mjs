import antfu from '@antfu/eslint-config'
import vitest from '@vitest/eslint-plugin'

export default antfu({
	type: 'lib',
	stylistic: {
		indent: 'tab',
		quotes: 'single',
	},
	typescript: true,
	// Only TS/JS is linted: package.json is rewritten by pnpm and semantic-release
	// with two-space JSON, and the YAML/Markdown formatters add nothing here.
	jsonc: false,
	yaml: false,
	markdown: false,
}, {
	rules: {
		'@typescript-eslint/consistent-type-imports': 'off',
	},
}, {
	// Test-only rule set; console is allowed in specs for spies and debugging.
	files: ['src/test/**/*.ts'],
	rules: {
		...vitest.configs.recommended.rules,
		'no-console': 'off',
	},
}, {
	// Bootstrap and operator scripts write to the console by design.
	files: ['src/main.ts', 'src/repl.ts', 'scripts/**/*.cjs'],
	rules: {
		'no-console': 'off',
	},
})
