import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseDirectory = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({
  baseDirectory,
  recommendedConfig: js.configs.recommended,
})

export default [
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
  }),
]
