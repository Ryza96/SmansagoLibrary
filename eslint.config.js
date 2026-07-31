const js = require('@eslint/js')
const tseslint = require('@typescript-eslint/eslint-plugin')
const reactPlugin = require('eslint-plugin-react')
const reactHooksPlugin = require('eslint-plugin-react-hooks')
const prettier = require('eslint-config-prettier')

module.exports = [
  {
    ignores: [
      'out/',
      'node_modules/',
      'dist/',
      'release/',
      'profiling/',
      'eslint.config.js',
      'electron.vite.config.ts',
      'tailwind.config.js',
      'postcss.config.js'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  reactPlugin.configs.flat.recommended,
  reactHooksPlugin.configs.flat.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off'
    }
  }
]
