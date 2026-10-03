# Ultimate 升级 Gate 重设计方案（DocKit / SQLKit）

> 调研时间：2026-09。调研范围：Raycast / Linear / Notion / Figma / Cursor / Warp / Zed / TablePlus / DataGrip / Beekeeper Studio / Postico，以及 Vue 3 动效库生态。
>
> **实现状态（2026-09-28）**：Phase 1 + Phase 2 已落地 —— `src/components/upgrade/` 下新增 `effects/`（AuroraBackground / ShimmerButton / ProgressiveBlur，纯 CSS 零依赖）、`FeaturePoster/`（AI / 集群 / 导入导出三张海报 + `posterFor` 字典）、`ProBadge`；`PaidGate`（含 compact 变体）与 `UpgradeDialog`（两栏迷你定价）已重写；`plan-section` 增加 Community vs Ultimate 对比表；`user-chip` / `the-aside` / `ssh-tunnel-section` / `dynamodb-connect-dialog` 已接入徽章体系；enUS/zhCN 文案已补齐（另修复了缺失的 `plan.nav.manage` key）。视觉验证 harness 在 `tests/manual/gate-harness.html`（`npx vite --config tests/manual/vite.harness.config.ts --port 1421` 后访问 `/tests/manual/gate-harness.html`，支持 `?only=ai|cluster|import|compact&freeze=1&auto=1`）。Phase 3（应用内一键试用、motion-v 编排）未做。
>
> **第二轮迭代（同日，gate 简化）**：按用户决策移除整页 gate 的玻璃卡（中间层与弹窗内容重复）——**最终形态：整页 gate = stage 容器内的大尺寸海报窗口（约占 page 78%×76%，四周留空隙看到 aurora，圆角/边框/阴影，内容按真实应用方式填满窗口：AI 聊天顶部对齐（底部留白被渐变模糊覆盖=对话在下方继续）、集群 nodes 面板拉伸、导入向导双栏拉伸）+ 海报底部中央的 "Unlock with Ultimate" 按钮（**slot 注入**：三张海报在自身 flex 列末尾暴露 `cta` slot，按钮成为海报布局的结构性一部分，而非绝对定位兄弟元素——从构造上杜绝包含块解析/内容高度变化导致的按钮位移） + 进页 300ms 自动弹出极简窄版 UpgradeDialog（580px 双栏：左栏 aurora + Sparkles 图标徽章，右栏定价面板）**。海报重写为真实 UI 高保真剪影（AI 聊天含 12s 一次性场景 flow：提问→思考→工具调用→回答；集群含 SVG 圆环仪表；导入含步骤卡+进度条）。曾试验大号 modal（80vw）方案后被此方案取代，`openUpgradeDialog` 保持单参数签名。同时修复：manage 页父级 `onMounted`/`watch(connection)` 在 gate 覆盖下泄漏请求与警告（改为 entitlement 门控）、Vue SFC 编译器将 `:global(X) Y` 混合选择器错误编译为裸 `X`（5 处改普通 scoped 属性选择器）。设置页 compact gate 保留内联卡片形态、不自动弹。第三轮细化：集群海报节点改名 `node-*.elasticsearch` 并补角色图标组（master 星标 + data 磁盘）与 IP Address/Shards/Mappings 真实标签；导入海报重写为 MongoDB case（真实 STEP 01 Target & Output 三字段 Connection/Database/Collection + New Collection 徽章、STEP 02 Source & Scope 拖放区、STEP 03 Schema & Structure，直接复用 `import.*` 真实 i18n key）；modal 未登录按钮统一为 Subscribe（跳 pricing 页，由 geekfun web 处理登录）+ Start 7-day free trial；compact gate 修复 aurora 随滚动截断（compact 改 overflow: hidden）并为 ai/mcp 卡片增加能力细节（10 个模型厂商 chips 含 Ollama/LM Studio 本地与 Custom 兼容端点；MCP 客户端兼容与 HTTP 端口说明）。第四轮比例校正：manage 海报 NODES 面板压缩到 42% 并新增同级 INDICES 表格（INDEX/HEALTH/DOCS/SIZE + 三行索引）与 Index Templates 条——对齐真实页面 metrics→nodes→indices→templates 的 section 序列；导入海报比例对齐真实页面（steps 列 flex:1 占宽、执行面板固定 300px），执行面板重写为真实 ImportExecutionPanel 结构（Validation Readiness 进度+Rows Detected/Estimated Duration、Import Strategy 单选 Append/Replace、Phase 2 导入横幅、条纹进度、底部 Start Import Task 按钮）。另修：ShimmerButton 扫光改为 hover 触发单次扫过（idle 完全静止——周期性扫光在显眼 CTA 上被感知为抖动）、Unlock 按钮改为 poster `cta` slot 注入（见上）、海报内容区 `min-height: 0 + overflow-y: auto`（flex 子项默认不可收缩，会把 slotted CTA 挤出海报边界——这就是"按钮跳到底部/海报底部被覆盖"的真正机制）。
第五轮打磨：Unlock CTA 商业化（主行 + 价格副行双文案、Sparkles 图标、渐变+内高光+主色光晕、hover 抬升）；gate 出现时序改为「页面入场(0.7s) → 按钮入场(1.15s) → 按钮脉冲提示 x2(1.95s) → modal 自动打开(2.8s)」让用户看清海报动画；设置 Basic 页 plan-section 合并为单卡（状态区 + Community/Ultimate 对比表），Ultimate/Recommended 徽章纵向堆叠修复溢出；compact gate 重构为单大卡上下布局（上=动画海报、下=文字信息，窄屏自适应），新增 McpPoster（状态/端口/Auto-start/客户端配置 JSON/工具列表，对齐真实 mcp-bridge 面板）并注册到 mcp_bridge；修复设置页 TabsContent 高度链（flex-1 拉伸）使 gate 铺满整个 tab。第六轮细节修正：Import/MCP 海报恢复误删的 `cta` slot（按钮回归）；海报内容区 `overflow-y: auto` 改为 `hidden`（无滚动元素，裁切交给折叠区）；`poster__cta` 上下等距 padding；modal 自动打开推迟到 3.2s（脉冲结束后）且入场时长 0.34s + 指数缓动；未登录按钮全面统一为 Subscribe（跳 pricing 页）+ Start 7-day free trial（modal / compact / plan-section 三处）；plan-section 状态区压缩为单行（徽章+版本+登录链接+按钮同行）。另：gate 打开的 modal 会**实测覆盖** Unlock 按钮——`openUpgradeDialog(feature, { coverCta: true })` 时 modal 渲染后测量 `.paid-gate__unlock-btn` 真实矩形，动态计算 margin-top 使按钮（含 16px 余量）落入 modal 体内；按钮不存在或已覆盖时偏移为 0。之所以不用视口百分比：真实窗口有工具栏/任意尺寸，按钮位置取决于容器而非视口，vh 猜测会失准（已实测推翻）。其他入口不传选项，保持居中。实现细节：对齐采用「重试等待 portal（≤60 帧）→ 等 0.38s 入场动画结束 → 迭代收敛（≤3 轮，每轮补足仍暴露的像素）」——单次测量会被入场动画的中间态骗到，动画结束后二次校正确保精确。（修正：:style 绑定在 Teleport 片段根上不透传——桌面端完全无效。最终方案为 alignToCta 直接对 DOM 元素设置 marginTop，公式用布局高度 offsetHeight + 按钮实测 bottom 计算，与入场动画 transform 无关，挂载即准；640px 矮窗口实测 margin 正确生效并完全覆盖按钮。）modal 入场动画同步重做：默认的「左 -50% + 顶 -48% 斜滑 + 缩放」叠加 margin 偏移后轨迹怪异（用户描述为画了个圆）——覆盖 preset-animations 的 enter 变量（--un-enter-translate-x: 0 / --un-enter-translate-y: 32px / scale 0.97，0.34s 指数缓出）实现从下到上升起，退出对称下落；覆盖规则用双类选择器提高特异性并放 unscoped 块（Teleport 根拿不到父 scoped 属性）。（修正：enter 变量是**绝对** from 状态 transform，不是增量——x 必须保持 -50% 居中、y 用 `calc(-50% + 32px)` 只加上升偏移；此前设 x=0 导致弹窗从视口边缘斜飞入中心，即用户看到的"画圆"。）脉冲改为单次（modal 提前至 2.7s）。（再修正：32px 升起幅度不可感知，视为未发生——最终方案为自定义 `modal-rise`/`modal-sink` 关键帧（from: translateY(46vh) + scale 0.98 → to: 原位，0.5s 指数缓出）只动 `transform`，水平居中由 Wind4 的独立 `translate` 属性承载，二者叠加纯垂直运动；退出为下沉 14px 淡出。）

第七轮：compact 卡放弃上下硬分割——海报作为整卡的绝对定位背景铺满，文字信息坐在底部 scrim 上（ProgressiveBlur 72% + 背景色渐变 tint 双层，海报自身的折叠区/锁标/CTA 槽在卡内隐藏避免重复）；海报内容区禁止滚动（overflow hidden）。第八轮：compact 文字区商业化重构——纯文本清单升级为「图标功能瓦片」（2 列，primary 色图标方块 + 标题/描述）+「品牌 logo 墙」（三组分组标签 CLOUD/LOCAL/CUSTOM，chips 内嵌 simple-icons 官方商标矢量图标：OpenAI/Anthropic/Gemini/DeepSeek/Grok/Mistral/Azure/Ollama；MCP 卡为 Claude/Cursor/Windsurf/Any client），compact 标题放大至 23px；新增 devDep `@iconify-json/simple-icons` 并注册进 uno.config presetIcons（构建期生成，零运行时成本）。
第九轮：导入海报补齐一次性场景动画（此前仅进度条条纹循环）——分步卡片依次入场（0.15/0.55/0.95/1.35s 阶梯）→ 完成态对勾与运行点弹出 → 执行面板入场 → Validation 进度条生长 → Append Records 策略卡选中高亮 → Phase 横幅滑入 → 导入进度条生长至 64% 并转条纹循环 → Start Import Task 按钮入场；与 AI 海报同为一次性 build-up、支持 reduced-motion 关闭。


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
