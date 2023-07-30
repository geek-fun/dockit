module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'plugin:vue/base',
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    './.eslintrc-auto-import.json',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier', 'eslint-plugin-vue'],
  rules: {
    'prettier/prettier': 'error',
    'vue/multi-word-component-names': 'off',
    'arrow-parens': [2, 'as-needed'],
    'arrow-spacing': [
      2,
      {
        before: true,
        after: true,
      },
    ],
    'key-spacing': [
      2,
      {
        beforeColon: false,
        afterColon: true,
      },
    ],
    'no-var': 'error',
    'no-console': 'error',
    'no-debugger': process.env === 'development' ? 'warn' : 'error',
  },
  ignorePatterns: ['dist'],
};
