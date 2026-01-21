import eslint from '@eslint/js';
import tsparser from '@typescript-eslint/parser';
import tseslint from '@typescript-eslint/eslint-plugin';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import autoImportGlobals from './.eslintrc-auto-import.json' with { type: 'json' };

export default [
  // Ignore patterns
  {
    ignores: [
      'node_modules',
      'dist',
      'index.html',
      'src-tauri/target',
      'coverage',
      '*.d.ts',
      '.vite',
    ],
  },

  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        ...autoImportGlobals.globals,
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      // Prettier
      'prettier/prettier': 'error',

      // Code style rules
      'arrow-parens': [2, 'as-needed'],
      'arrow-spacing': [2, { before: true, after: true }],
      'key-spacing': [2, { beforeColon: false, afterColon: true }],
      'no-var': 'error',
      'no-console': 'warn',
      'no-debugger': process.env.NODE_ENV === 'development' ? 'warn' : 'error',
      'no-useless-catch': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',

      // Disable base rule and use TypeScript version (handles mapped types correctly)
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Test files - add Jest globals
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        ...autoImportGlobals.globals,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      // Prettier
      'prettier/prettier': 'error',

      // Code style rules
      'arrow-parens': [2, 'as-needed'],
      'arrow-spacing': [2, { before: true, after: true }],
      'key-spacing': [2, { beforeColon: false, afterColon: true }],
      'no-var': 'error',
      'no-console': 'off', // Allow console in tests
      'no-debugger': process.env.NODE_ENV === 'development' ? 'warn' : 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Config files - add Node globals
  {
    files: ['*.config.js', '*.config.ts', '*.config.cjs'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      // Prettier
      'prettier/prettier': 'error',

      // Code style rules
      'arrow-parens': [2, 'as-needed'],
      'arrow-spacing': [2, { before: true, after: true }],
      'key-spacing': [2, { beforeColon: false, afterColon: true }],
      'no-var': 'error',
      'no-console': 'off', // Allow console in config files
      'no-debugger': process.env.NODE_ENV === 'development' ? 'warn' : 'error',
    },
  },

  // Vue files
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsparser,
        sourceType: 'module',
        ecmaVersion: 'latest',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        ...autoImportGlobals.globals,
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      // Prettier
      'prettier/prettier': 'error',

      // Vue-specific rules
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',
      'vue/require-v-for-key': 'warn',
      'vue/valid-v-for': 'warn',
      'vue/no-use-v-if-with-v-for': 'warn',
      'vue/require-default-prop': 'warn',
      'vue/no-template-shadow': 'warn',
      'vue/no-required-prop-with-default': 'warn',

      // Code style rules
      'arrow-parens': [2, 'as-needed'],
      'arrow-spacing': [2, { before: true, after: true }],
      'key-spacing': [2, { beforeColon: false, afterColon: true }],
      'no-var': 'error',
      'no-console': 'warn', // Warn instead of error in Vue files
      'no-debugger': process.env.NODE_ENV === 'development' ? 'warn' : 'error',
      'no-useless-catch': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',

      // Disable base rule and use TypeScript version
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Prettier config (must be last to override other configs)
  prettierConfig,
];
