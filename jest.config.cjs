module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.claude/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^monaco-editor(/.*)?$': '<rootDir>/node_modules/monaco-editor/esm/vs/editor/editor.api.js',
  },
};
