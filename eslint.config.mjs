import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // public/ là frontend browser (plain JS, không build) — lint với Node globals sẽ sai.
  // EN: public/ is browser frontend (plain JS, no build) — linting with Node globals would be wrong.
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'modules/webui/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      // Node globals đầy đủ (process, console, URL, Buffer, __dirname...) — for all .js/.ts files
      globals: globals.node,
    },
    rules: {
      // Cho phép tham số/biến bắt đầu bằng `_` (thường dùng trong mock/test)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);