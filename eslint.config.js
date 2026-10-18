import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'mcp/dist/**', 'node_modules/**', 'examples/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'mcp/src/**/*.ts', 'mcp/tests/**/*.ts', 'vitest.config.ts', 'mcp/vitest.config.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
