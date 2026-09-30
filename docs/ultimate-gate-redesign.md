# Ultimate 升级 Gate 重设计方案（DocKit / SQLKit）

> 调研时间：2026-09。调研范围：Raycast / Linear / Notion / Figma / Cursor / Warp / Zed / TablePlus / DataGrip / Beekeeper Studio / Postico，以及 Vue 3 动效库生态。
>
> **实现状态（2026-09-28）**：Phase 1 + Phase 2 已落地 —— `src/components/upgrade/` 下新增 `effects/`（AuroraBackground / ShimmerButton / ProgressiveBlur，纯 CSS 零依赖）、`FeaturePoster/`（AI / 集群 / 导入导出三张海报 + `posterFor` 字典）、`ProBadge`；`PaidGate`（含 compact 变体）与 `UpgradeDialog`（两栏迷你定价）已重写；`plan-section` 增加 Community vs Ultimate 对比表；`user-chip` / `the-aside` / `ssh-tunnel-section` / `dynamodb-connect-dialog` 已接入徽章体系；enUS/zhCN 文案已补齐（另修复了缺失的 `plan.nav.manage` key）。视觉验证 harness 在 `tests/manual/gate-harness.html`（`npx vite --config tests/manual/vite.harness.config.ts --port 1421` 后访问 `/tests/manual/gate-harness.html`，支持 `?only=ai|cluster|import|compact&freeze=1`）。Phase 3（应用内一键试用、motion-v 编排）未做。

## TL;DR

1. **现状问题**：所有升级触点（PaidGate / UpgradeDialog / plan-section / user-chip）都是"锁图标 + 两行文案 + 两个按钮"，没有展示被锁功能的价值，没有视觉层级，没有信任要素。
2. **市面共识**：最有效的 gate 不是"墙"，而是**在被锁住的价值时刻、展示被锁功能本身**（Raycast 用假聊天记录、Cursor 列具体收益、Beekeeper 让你先试用后回落）。DocKit 的 AI Data Studio 是整页 gate，恰好是做"模糊预览 + 玻璃卡片"的最佳画布。
3. **被浪费的王牌**：DocKit 的 **version-lock（订阅期版本永久可用，可离线）** 是 JetBrains perpetual fallback / Beekeeper Lifetime Access 同款的信任机制，是数据库工具里最能打消订阅抵触的卖点，现在只在一个小 Badge 里出现，应该放进 gate 的核心位置。
4. **技术选型**：**零新依赖起步** —— 项目已装 `unocss-preset-animations` + `backdrop-filter`（WKWebView/WebView2 都支持），aurora 渐变 / 毛玻璃 / shimmer / 光斑全部纯 CSS 可做；从 **Inspira UI**（shadcn-vue 官方团队出品的 Magic UI/Aceternity Vue 移植，MIT，copy-paste 模式）抄组件源码改造成 UnoCSS；**motion-v** 作为二期可选（弹窗编排需要弹簧物理时再上）。
5. **SQLKit 复用**：所有新组件收口在 `src/components/upgrade/`，视觉参数（feature id、i18n key、海报组件）全部外置，SQLKit 直接拷目录。

---

## 一、现状盘点（所有 Ultimate 触点）

| 触点 | 文件 | 现状 | 问题 |
|---|---|---|---|
| 整页 gate（AI Data Studio） | `src/views/data-studio/index.vue` → `PaidGate feature="ai"` | 锁图标+文案+按钮 | **最大的一块画布**（整页），却只放了三行字；AI 功能完全不可感知 |
| 整页 gate（集群管理） | `src/views/manage/index.vue` → `PaidGate feature="cluster_manage"` | 同上 | 集群仪表盘是视觉上最有"产品感"的页面，适合做剪影预览 |
| 整页 gate（导入导出） | `src/views/import-export/index.vue` → `PaidGate feature="import_export"` | 同上 | — |
| 设置页内嵌 gate（AI / MCP） | `src/views/setting/index.vue` 两处 `PaidGate` | 同上，压缩在卡片里 | 需要紧凑变体 |
| 升级弹窗 | `src/components/upgrade/UpgradeDialog.vue` | 400px，同款三行文案 | 信息密度太低，没有价格结构、没有价值清单 |
| 设置-订阅卡片 | `src/views/setting/components/plan-section.vue` | 状态罗列 | 没有 Community vs Ultimate 对比 |
| 侧边栏用户卡 | `src/layout/components/user-chip.vue` | secondary Badge + Upgrade 按钮 | 入口太弱，可以做成"Pro 徽章"体系的一部分 |
| 连接级 gate | ssh-tunnel-section / dynamo-connect-dialog 等（`ssh_tunnel` / `proxy` / `aws_profile`） | 内联提示 | 需要统一 lock 徽章样式 |

定价事实：$9.9/mo · $99/yr（年付约 83 折）· 7 天免费试用。**RevenueCat 2026 数据：5–9 天试用是转化甜点区（52% 的应用），DocKit 的 7 天正好在甜点区，这是可以在文案里强调的。**

---

## 二、市面产品怎么做（结论提炼）

### 2.1 逐产品要点

- **Raycast Pro**：gate 不是模糊遮罩而是**可见但打标**——高级模型在列表里正常显示，只是带星标"需 Advanced AI"。营销页用**假聊天记录 + 模型选择条**做 AI 卖点演示。免费层保持完整可用（"核心功能不锁"是评论公认的好感来源）。
- **Linear**：应用内**不放插屏 upsell 弹窗**（刻意为之），升级入口只在 Settings → Plans；定价页 yearly 优先 + 数字滚动动画；所有付费层写"All Free features +"（叠加式表述，永远不显得惩罚性）。
- **Notion**：对比表里付费 AI 功能在免费层标注 **"Limited Trial"** ——在原位先试用再撞 gate；Business 层标 "Recommended"（锚点模式）。
- **Cursor**：限额弹窗文案结构是教科书：**撞限声明 → Upgrade 动词 → 3–4 条具体收益 → 重置时间**（"Your usage limits will reset…"，泄愤阀）。Hobby 卡片直接写 "No credit card required"。
- **Warp**：额度折算成真金白银（"1,500 credits ≈ $20 API 用量"）；自己的隐私政策文档里甚至列出了 "Tier Limit Hit" 埋点 —— limit 弹窗是一等公民设计面。
- **Zed**：BYO key 免费用 AI（价格透明："API list price +10%"）；**反面教材**：试用结束后用户掉进坏状态（GitHub #28540）、无法移除的升级按钮被 HN 抨击 —— gate 必须可干净回退、不常驻骚扰。
- **TablePlus**：试用限制是**容量型**（最多 2 tab / 2 窗口 / 2 高级筛选）——在你最有效率的时候撞墙，但没有任何功能被藏起来。
- **DataGrip**：**perpetual fallback license**（订阅 12 个月 → 该版本永久拥有）+ 续订递减折扣，开发者工具里最建立信任的两个机制。
- **Beekeeper Studio**（和 DocKit 最像的同门：Community/Ultimate 命名、开源+商业混合）：**14 天试用在应用内点击开始**（不用账号、不用卡），到期**回落 Community、数据保留**；"Lifetime Access"：订阅 12 个月 → 订阅期内发布的版本永久可用。5.0 改授权模式时因沟通不当被 HN 反噬 —— **gate 的呈现方式和内容本身一样重要**。
- **Postico**：无时间限制试用（部分功能禁用），付费靠自觉 —— 诚实门模式。

### 2.2 跨产品高频模式（按出现频率排序）

1. **叠加式表述**："Everything in [低一层], plus:"（5/6 SaaS）
2. **价值时刻的上下文 gate + 具体收益清单 + 重置/后果说明**（Cursor/Warp/Zed/TablePlus）
3. **免费层是完整产品，只锁高级面**（所有桌面工具的共识）
4. **试用：不用卡、应用内首次使用时开启、到期干净回落**（Beekeeper 原样机制）
5. **月/年 toggle + 省 X% 徽章 + 年付默认展示**
6. **"Recommended" 锚点层**
7. **打标不藏匿**（Raycast 星标 / Notion "Limited Trial"）—— 桌面端对"模糊预览"的礼貌版
8. **信任与风险逆转微文案**：No credit card / Cancel anytime / 退款窗口 / 永久回退授权

### 2.3 转化数据要点（写文案时可用）

- Freemium 转化 2–5%，免费试用转化 10–25%（ideaplan.io 2026）
- B2B SaaS 试用→付费中位数 ≈ 18.5%，头部 35–45%（flint.com）
- **硬 paywall（可见但锁住）比 freemium 转化高约 5 倍**（RevenueCat 2026：D35 10.7% vs 2.1%），且首年留存几乎相同 —— "展示但模糊/锁住"是有数据支撑的
- **5–9 天试用长度是甜点区**（52% 的应用）—— DocKit 的 7 天正好
- 上下文触发（撞限时）> 定时插屏（RevenueCat "Contextual Paywall Targeting"）

### 2.4 反模式（别做）

- ❌ 常驻、不可移除的升级入口（Zed HN 事件）
- ❌ 试用结束掉进坏状态、无应用内重入路径（Zed #28540）
- ❌ 惩罚式表述（"此功能被锁定"）而非叠加式（"Ultimate 额外解锁"）
- ❌ 改授权模式不给老用户 grandfathering（Beekeeper HN 事件）

---

## 三、库选型结论

| 方案 | 定位 | 结论 |
|---|---|---|
| **纯 CSS（UnoCSS keyframes + backdrop-filter）** | aurora 渐变、毛玻璃、shimmer、glow、进度模糊 | ✅ **一期主方案**。`presetWind4` 原生有 `backdrop-blur-*`/`blur-*`；`unocss-preset-animations` 已装（`animate-in/out` Dialog 已在用）；自定义 keyframes 加进 `uno.config.ts` 的 `theme.animation` 或 scoped style。零依赖、零体积，WKWebView/WebView2 全支持 |
| **Inspira UI**（inspira-ui.com，unovue/shadcn-vue 官方团队维护，5k stars，MIT，copy-paste 非 npm） | Magic UI + Aceternity UI 的 **Vue 官方移植**：`aurora-background`（纯 CSS）、`card-spotlight`（纯 Vue mousemove + radial-gradient）、`shimmer-button`（纯 CSS）、`glow-border`、`border-beam`、`progressive-blur`、`animated-modal` | ✅ **组件模板来源**。直接拷源码进 `src/components/ui/effects/`，把 Tailwind 类映射到 UnoCSS（大部分工具类同名；`--animate-*` token 改写为 `theme.animation.keyframes`）。Magic UI / Aceternity 本体是 React-only，别找错了 |
| **motion-v**（motion.dev/vue，Motion for Vue 官方，606k 周下载，很活跃，~42–48KB gz） | 弹簧物理、`AnimatePresence` 退场编排、stagger | ⏸ **二期可选**。Dialog 进出场 radix-vue 已带 `animate-in/out`；只有需要复杂编排（多元素弹簧 stagger）时才值得引入。`@vueuse/motion` 已停更 18 个月，不要用 |
| **@formkit/auto-animate**（3.3KB） | 列表 FLIP 动画 | ❌ gate 的功能清单是静态的，用不上 |
| **GSAP**（2025 起 100% 免费商用） | 时间线/SplitText | ❌ 命令式模型，为一个弹窗不值得 |

> 没有"Vue 付费墙组件库"这种东西 —— 2025–26 的行业现状就是 shadcn-vue Dialog + 手写定价内容 + Inspira UI 特效件。我们自己做，收口成可复用模块。

---

## 四、DocKit / SQLKit 三层方案

### 设计原则（来自调研的硬约束）

1. **叠加式文案**：所有 gate 标题从 "Upgrade to Ultimate" 升级为**按功能的价值主张**（如 AI gate："用自然语言问你的数据库"），正文用 "Community 之上，Ultimate 额外解锁："
2. **展示被锁价值**：每个 gate 必须有该功能的可视化预览（静态海报 + 渐进模糊），不只是一把锁
3. **信任三件套常驻**：version-lock 永久可用 / BYO LLM key（无 token 加价）/ 随时取消 + 7 天免费试用
4. **打标不藏匿**：导航和连接表单里的付费项保持可见，统一 lock 徽章，不做"假装不存在"
5. **可安静**：所有常驻入口（user-chip）保持克制，动画只在 gate 打开时播放，尊重 `prefers-reduced-motion`

### Layer 1 — 整页 PaidGate：从"三行字"到"产品剧场"

这是投入产出比最高的一层。AI Data Studio / 集群管理 / 导入导出三个整页 gate 共用一套结构：

```
┌────────────────────────────────────────────────────────┐
│  （aurora 动画渐变背景，全页，低饱和、跟随主题）              │
│                                                        │
│   ┌─────────────────────────────────────────────┐     │
│   │   功能海报（静态剪影，见下）· 底部 progressive-blur │     │
│   │                                             │     │
│   │   = 被锁功能的"广告片"，占 gate 视觉 60%        │     │
│   └─────────────────────────────────────────────┘     │
│                                                        │
│   ┌─────────────── 玻璃卡片（居中悬浮） ─────────────┐   │
│   │ ✦ 价值主张标题（按 feature 定制，i18n）          │   │
│   │ Community 之上，Ultimate 额外解锁：              │   │
│   │  ✓ Agent · NL2SQL · 解释 · 优化 · 一键修复      │   │
│   │  ✓ 自带 LLM Key，无 token 加价                  │   │
│   │ ───────────────────────────────────────────── │   │
│   │ $99/年（≈$8.3/月，省 17%）· $9.9/月 · 7 天试用  │   │
│   │ [ 开始 7 天免费试用 ]  [ 已订阅？刷新权益 ]       │   │
│   │ 🔒 订阅期内版本永久可用 · 随时取消                │   │
│   └─────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────┘
```

**功能海报（每 feature 一张，纯 HTML/CSS 静态剪影，无截图依赖）：**

- `ai`：仿聊天记录（学 Raycast）—— 用户气泡"找出最近 7 天支付失败的订单" → agent 回复折叠的工具调用卡 → 生成的 DSL + 结果表格；最后一条消息被 progressive-blur 渐隐 + 一枚 Pro 锁标。**这张海报同时是 AI 功能的产品教育。**
- `cluster_manage`：仿集群仪表盘剪影 —— 健康度色点、节点/分片分布条、索引列表骨架，右下角模糊渐隐。
- `import_export`：仿导入向导 —— 文件行 + 进度条 + 成功计数，尾部模糊。
- `ssh_tunnel` / `proxy` / `aws_profile`（内联场景）：不需要海报，用统一的 lock 徽章 + 一句话 + "了解 Ultimate"链接（弹 UpgradeDialog）。

**实现要点：**

- 海报是 `FeaturePoster[feature].vue` 的小组件字典，数据驱动（写死的假数据放组件内，文案走 i18n），SQLKit 换海报数据即可复用全部外壳。
- aurora 背景：三层大半径 radial-gradient（主色绿色 + 两个低饱和邻近色），`background-position` 60s 循环关键帧，暗色模式换低亮度变量。
- 玻璃卡片：`bg-background/70 backdrop-blur-xl border border-border/60` + 呼吸光晕（box-shadow 关键帧）；卡片内容 stagger 入场（CSS `animation-delay` 递增，`animate-in fade-in slide-in-from-bottom-2`，复用现有 preset）。
- 登录态分支保留现有逻辑：未登录 → 主 CTA "开始 7 天免费试用"（走注册）+ 次 CTA "已有账号？登录"；已登录未订阅 → 主 CTA "升级"；已订阅版本被锁 → 保留现有 version-locked Badge 与刷新按钮。

### Layer 2 — UpgradeDialog：从"通知"到"迷你定价页"

弹窗（user-chip / 内联 gate 触发）升级为 560px 左右两栏：

```
┌──────────────────────────────────────────────┐
│ ┌────────────┐  Ultimate                     │
│ │  迷你海报    │  Community 之上，额外解锁：      │
│ │ （对应feature│  ✓ AI Agent · NL2SQL · 修复    │
│ │  或AI海报）  │  ✓ 集群管理与监控               │
│ │  aurora 底  │  ✓ 导入导出 · SSH · MCP bridge │
│ └────────────┘  ────────────────────────────  │
│                 [$99/年 -17%] [$9.9/月] toggle │
│                 [ ✨ 开始 7 天免费试用 ]（shimmer）│
│                 订阅期内版本永久可用 · 随时取消     │
└──────────────────────────────────────────────┘
```

- 弹窗内做**轻量价格结构**：年/月两个 chip（年付默认选中并带 -17% 徽章），不引入完整 toggle 逻辑也可以（外链到 pricing 页购买），但视觉上要让 "$99/年" 成为主价格锚点。
- 主按钮用 **shimmer-button**（纯 CSS 扫光），已登录未订阅时文案换 "升级到 Ultimate"。
- 保留刷新权益次按钮和 version-locked 状态徽章（现有逻辑不动）。
- 进出场动画沿用 radix-vue `animate-in/out`，内容 stagger 同 Layer 1。

### Layer 3 — Pro 徽章体系：打标不藏匿

- 新建 `ProBadge.vue`：小尺寸锁/星标徽章，用于导航项（AI、集群管理、导入导出）、设置分组标题、连接表单的 SSH/Proxy/AWS 选项 —— 学 Raycast 的"星标不隐藏"。
- `user-chip.vue`：Community 用户的 Upgrade 按钮升级为**细边框流光按钮**（border-beam 样式，低速率、hover 才加速），尺寸不变、不弹跳不打扰 —— 反面教材是 Zed 的常驻骚扰。
- `plan-section.vue`：改为 Community vs Ultimate 两列迷你对比表（checkmark 矩阵，学 Linear），Ultimate 列含"推荐"徽章；version-lock 说明保留。
- 导航中被 gate 的项 hover 时 tooltip 预告功能（现有 TooltipProvider 直接用）。

### 组件架构（收口，便于 SQLKit 整体拷贝）

```
src/components/upgrade/
├── PaidGate.vue              # 重写：aurora 背景 + 海报 + 玻璃卡片，紧凑 variant prop
├── UpgradeDialog.vue         # 重写：两栏迷你定价
├── ProBadge.vue              # 新增：统一锁徽章
├── FeaturePoster/
│   ├── index.ts              # poster 组件字典（feature → component）
│   ├── AiPoster.vue          # 假聊天记录剪影
│   ├── ClusterPoster.vue     # 仪表盘剪影
│   └── ImportExportPoster.vue
├── effects/
│   ├── AuroraBackground.vue  # 拷自 Inspira UI，Tailwind→UnoCSS
│   ├── ShimmerButton.vue     # 拷自 Inspira UI
│   └── ProgressiveBlur.vue   # 底部渐隐遮罩
└── upgradeDialogService.ts   # 不动
```

uno.config.ts 增量：`theme.animation.keyframes` 加 `aurora` / `shimmer` / `border-beam` 三组（Inspira UI 源码里有现成的，直接翻译），safelist 加对应 animate 类。

### 文案改写要点（i18n）

- 每个 feature 一条价值主张标题（替代统一 "Upgrade to Ultimate" 作为视觉主标题，"Ultimate" 降级为品牌名出现在卡片区）
- 正文统一叠加式："Community 之上，Ultimate 额外解锁："
- 信任行常驻："订阅期内发布的版本永久可用（含离线）· 自带 LLM Key，无 token 加价 · 随时取消"
- 价格行强调年付省 17%，试用文案强调 "7 天免费试用，无需信用卡"（若试用需要注册则写"只需一个账号"）

---

## 五、落地路线

**Phase 1（零新依赖，纯 CSS + 现有 preset）**
1. effects/ 三件套（aurora / shimmer / progressive-blur）+ uno keyframes
2. 重写 UpgradeDialog（两栏 + 价格结构 + 信任行）
3. 重写 PaidGate（aurora + 玻璃卡片 + 文案改写），海报先用一张通用 AI 海报顶三个入口
4. i18n 文案补齐（en/zh）

**Phase 2（海报矩阵 + 徽章体系）**
5. 三张功能海报 + poster 字典
6. ProBadge 铺到导航 / 设置 / 连接表单
7. user-chip 流光按钮 + plan-section 对比表

**Phase 3（可选，评估后再上）**
8. motion-v：弹窗内容弹簧 stagger、海报 hover 视差（card-spotlight 交互增强）
9. 试用体验机制（Beekeeper 式应用内一键开试用、到期回落 Community）—— 这是产品机制改动，需要后端配合，视觉改造稳定后再做

## 六、注意事项

- **暗色模式**：aurora 三色和玻璃透明度必须走 CSS 变量分亮暗两套（现有 `.dark` 变量体系直接扩展）；海报剪影用 `muted`/`border` 变量而非写死色值。
- **reduced-motion**：aurora/shimmer/流光全部包 `@media (prefers-reduced-motion: reduce)` 降级为静态。
- **性能**：gate 是低频页面，但 aurora 用 `background-position` 而非 transform 会触发 repaint——面积控制在背景层、`will-change: background-position`，或退而求其次用两层伪元素 transform 位移。桌面 WebView 性能余量大，问题不大，但别在常驻组件（user-chip）上跑无限动画。
- **回归红线**：PaidGate 的登录态分支、version-locked 徽章、`upgradeDialogService` 注册机制、entitlement 刷新逻辑全部保留，只动展示层。
- **SQLKit**：整个 `src/components/upgrade/` 目录 + i18n `plan.*` key 段 + uno keyframes 三块拷走即用；海报数据与文案全部通过 props/i18n 注入，无 DocKit 硬编码。

## 附：主要参考

- Raycast Pro: raycast.com/pro · manual.raycast.com/billing
- Beekeeper Studio: beekeeperstudio.io/pricing（Community/Ultimate 同款命名 + 应用内试用）
- Cursor 限额弹窗文案: github.com/cursor/cursor/issues/450
- Warp 限额弹窗（隐私政策里的埋点证据）: docs.warp.dev
- RevenueCat State of Subscription Apps 2026（硬 paywall 5x、试用长度甜点区）
- Inspira UI: inspira-ui.com · github.com/unovue/inspira-ui（shadcn-vue 团队出品）
- motion-v: motion.dev/vue
- TablePlus: tableplus.com/pricing · DataGrip: jetbrains.com/datagrip
