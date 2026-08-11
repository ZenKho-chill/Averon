import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      // Node globals đầy đủ (process, console, URL, Buffer, __dirname...) — for all .js/.ts files
      globals: globals.node,
    },
  },
);