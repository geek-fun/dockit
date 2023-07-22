module.exports = {
  // 若项目中有多个子项目，且每个项目都会有.eslintrc，子项目会一直向上查找所有的.eslintrc，直到找到root:true的eslintrc，再将所有的.eslintrc合并
  root: true,
  env: {
    // Node.js 全局变量和作用域
    node: true,
    es2022: true,
  },
  // 继承另一个配置文件的所有特性
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  // 解释器
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  // 插件，向ESLint添加各种扩展，可以定义规则，环境或配置的第三方模块
  plugins: ['prettier', '@typescript-eslint'],
  // 规则
  rules: {
    // 禁止使用 console
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    // 禁止使用 debugger
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    // 逗号前面没有空格 后面有空格
    'comma-spacing': [
      2,
      {
        before: false,
        after: true,
      },
    ],
    'prettier/prettier': 'warn',
  },
};
