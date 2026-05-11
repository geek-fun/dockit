module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.claude/'],
  moduleNameMapper: {
    '^monaco-editor(/.*)?$': '<rootDir>/node_modules/monaco-editor/esm/vs/editor/editor.api.js',
  },
  globals: {
    'import.meta': {
      env: {
        VITE_FEATURE_MONGODB: process.env.VITE_FEATURE_MONGODB || 'false',
      },
    },
  },
};
