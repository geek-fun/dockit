# 代码规范说明
> 配置项见 `.prettierrc` 文件
- 使用`单引号`代替双引号
- 一行最多`100`字符
- 使用`2`个空格缩进
- 不使用 tab 缩进，而`使用空格`
- 行尾需要有分号
- 大括号内的首尾需要空格 `{ foo: bar }`
- 箭头函数，只有一个参数的时候，不需要括号
- 换行符 'lf'

# 提交规范
> 为了方便使用，我们避免了过于复杂的规定，格式较为简单且不限制中英文

```awk
<type>(<scope>): <subject>
// 注意冒号 : 后有空格
// 如 feat(miniprogram): 增加了小程序模板消息相关功能
```
scope 选填，表示commit的作用范围，如数据层、视图层，也可以是目录名称

subject 必填，用于对commit进行简短的描述

type 必填，表示提交类型，值有以下几种：

- feature 新功能 feature
- bug 此项特别针对bug号，用于向测试反馈bug列表的bug修改情况
- fix 修复 bug
- ui 更新 ui
- docs 文档注释
- style 代码格式(不影响代码运行的变动)
- refactor 重构、优化(既不增加新功能，也不是修复bug)
- perf 性能优化
- test 增加测试
- chore 构建过程或辅助工具的变动
- revert 回退
- merge 合并分支， 例如： merge（前端页面）： feature-xxxx修改线程地址
- build 打包
- release 发布
- deploy 部署