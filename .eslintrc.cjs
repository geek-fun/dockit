module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/ban-types': [
      'error',
      {
        types: {
          // for codegen un-ban a type that's banned by default
          '{}': false,
        },
        extendDefaults: true,
      },
    ],
  },
  ignorePatterns: ['dist'],
};
