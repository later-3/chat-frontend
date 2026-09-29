# Chat Frontend UI/UX 规范

- 状态：规范基线
- 版本：3.12
- 适用项目：Chat Pi Web Frontend
- 最后校正：2026-09-29
-  art 方向：安静画廊级工具表面（littleplains / aside / resurf / daybridge 取精度不取装饰）；暖灰 + 墨字 + 克制紫品牌不变，深浅双主题同时成立

## 1. 文档地位

本文是 Chat 浏览器端与 PWA 的 UI/UX 规范事实源，适用于页面设计、实现、重构、评审和缺陷修复。`frontend/AGENTS.md`声明必须遵守本文；Chat Project 的 UI/UX Rule 负责在一次 Agent 任务中激活该要求，但不复制全文。

本文不定义 Backend、Workflow 或 Pi Agent 的业务架构。涉及数据归属、HTTP 合同和 Session 事实源时，同时遵守 Chat 根仓库的 `AGENTS.md`、`docs/architecture/chat-current-architecture.md` 和 Frontend 自身的 `AGENTS.md`。

规范词含义：

- **MUST / 必须**：安全、可访问性、事实一致性或跨平台底线，不得凭审美偏离。
- **SHOULD / 应当**：默认采用；偏离时必须说明具体场景和收益。
- **MAY / 可以**：可选增强，不作为完成任务的必要条件。

现有页面不因本文发布而自动判为缺陷，但任何新页面和本次触达的区域都必须不再扩大不一致；能在任务范围内安全收敛时，应同步改进。历史实现不是新增例外的理由。

## 2. 产品与平台模型

Chat 是面向本地 Agent 工作的高信息密度工具，不是营销网站。核心场景包括长对话、流式输出、Workflow 状态、人工审核、Session 列表、文件与代码浏览、配置和长期运行任务。

所有视觉与交互设计必须遵守以下原则：

1. **清晰优先**：先表达状态、层级和下一步，再考虑装饰。
2. **克制一致**：减少无意义颜色、阴影、动画和组件变体。
3. **可预测可恢复**：相同动作产生相同反馈；失败、刷新、断线和误操作都有恢复路径。
4. **同一心智模型、不同输入密度**：Web 与 PWA 使用相同术语、信息架构和业务语义，但针对鼠标、键盘和触控调整尺寸与布局。
5. **服务真实任务**：不使用横向故事滚动、营销式 Bento 展示、3D 装饰、霓虹发光或大面积渐变来替代工具结构。
6. **渐进增强**：基础任务在普通浏览器中可用；PWA、View Transition、通知等能力只能增强体验。

## 3. Web 与 PWA

### 3.1 共同要求

- Web 标签页和已安装 PWA 必须共享路由、业务能力、数据合同和核心操作顺序。
- 不得为 PWA 建立第二套页面状态、Session 状态或 API。
- 响应式设计必须依据可用空间和输入能力，不得只用设备名称或 User-Agent 判断。
- hover 只能是增强；所有操作必须能通过点击、触控和键盘完成。
- 页面在刷新、恢复前台和网络重连后，必须以 Backend 与 Pi Session 的持久事实校正显示。

### 3.2 当前响应式基线

当前 Frontend 的紧凑布局入口是 `hooks/useIsMobile.ts` 中的 `MOBILE_QUERY`：

```text
(max-width: 768px), (hover: none) and (pointer: coarse) and (max-height: 500px)
```

- **Compact**：命中 `MOBILE_QUERY`。使用单主任务面、触控尺寸、移动工具栏或 Sheet。
- **Medium**：未命中 Compact 且可用宽度小于 960px。减少常驻辅助面板，优先主任务。
- **Expanded**：宽度不小于 960px。可以使用列表—详情、多面板和可调整宽度。
- 新增断点必须先证明现有三个层级无法表达需求；同一语义不得在多个文件中发明不同断点。

### 3.3 PWA 专项

- 必须保留 `viewport-fit=cover`、安全区变量和独立窗口模式适配。
- 顶部、底部和贴边浮层必须考虑 `safe-area-inset-*`。
- 软件键盘打开时，输入区和当前编辑内容必须保持可见；不得通过固定 `100vh` 假设覆盖 Visual Viewport。
- PWA 返回行为必须优先关闭当前临时层级，再离开页面；弹窗、Sheet 和预览层需要清晰的关闭路径。
- Service Worker 不得缓存认证数据、Session、API、SSE/NDJSON 或实时 Agent 内容。离线时必须明确显示离线状态，不得把旧数据伪装成最新结果。
- 安装、通知、徽标和 View Transition 均为可选增强；失败不能阻塞核心聊天和文件操作。
- 主题必须在 React 首屏前解析，避免独立 PWA 启动时明暗闪烁。

## 4. 视觉语言

Chat 的默认风格是温暖、安静、有辨识度的个人工作台：暖灰表面、墨色正文、克制的紫色强调。个性来自排版、表面和头像，不用装饰压过任务。深色模式不是唯一主模式；浅色和深色必须同时成立。

### 4.1 颜色

颜色必须通过语义角色表达用途，而不是以某个页面或组件命名。当前基础 Token 位于 `src/styles.css`：

| 角色 | 当前 Token | 用途 |
|---|---|---|
| 页面背景 | `--bg` | 应用主背景 |
| 面板背景 | `--bg-panel` | 侧栏、工具栏、分组表面 |
| 悬停背景 | `--bg-hover` | 可交互项 hover |
| 选中背景 | `--bg-selected` | 当前项或选中项 |
| 细微背景 | `--bg-subtle` | 次级区块、代码与引用 |
| 装饰边界 | `--border` | 面板分隔线 |
| 必要控件边界 | `--border-control` | 控件识别与状态边界 |
| 主文字 | `--text` | 正文和主要标签 |
| 次文字 | `--text-muted` | 辅助说明 |
| 弱文字 | `--text-dim` | 元数据，不得承载关键信息 |
| 强调 | `--accent` | 链接、焦点和主要动作 |
| 强调悬停 | `--accent-hover` | 强调动作 hover |

必须遵守：

- 新增颜色优先复用语义 Token；跨两个以上组件使用的新语义必须先在全局 Token 中定义。
- 不得在业务组件中新增仅为“看起来更好”的硬编码十六进制颜色。强调底文字一律 `--on-accent`（禁 `#fff` 直写）；错误一律 `--danger`（禁 `#dc2626` 直写）；成功 / 警告一律 `--success` / `--warning`（禁 `#059669` / `#d97706` 直写）；未读 / 信息强调一律 `--accent`（禁 `#0891b2` 直写）；git renamed 一律 `--accent`（禁 `#60a5fa` 直写）；t/s 徽标用 `--bg-selected` + `--text-muted`（禁彩虹四色标）。画布 JPEG 底 `#fff` 与品牌 SVG 路径黑是内容语义例外。
- 成功、提醒、危险、信息等状态色必须形成语义 Token，并分别验证明暗主题。
- 普通文字对比度至少 4.5:1；大号或粗体文字至少 3:1；控件边界、焦点和关键图标至少 3:1。
- 状态不能只依赖颜色，必须配合文字、图标、形状或位置。
- `--text-dim` 不能用于正文、表单值、错误原因或唯一操作提示。
- 大面积纯黑、炫光、玻璃透明层和渐变不是默认语言；只有内容语义确实需要时才可使用。

### 4.2 字体与排版

- 普通界面、说明和长文本使用 `--font-sans`；代码、命令、路径、ID、日志和结构化技术值使用 `--font-mono`。Token 由 `src/styles.css` 定义。
- 品牌字体通过 `@fontsource-variable` 自托管并随应用分发：`--font-sans` 首选 Instrument Sans Variable，`--font-mono` 首选 JetBrains Mono Variable；两者在 `src/main.tsx` 中引入，Vite 会对其 woff2 产物做指纹缓存。
- 中文不打包 webfont：中文字形回退到系统栈（PingFang SC、Hiragino Sans GB、Microsoft YaHei 等），避免 CJK 字体产物体积失控。新增字体必须沿用"拉丁品牌字体自托管 + 中文系统回退"的模式。
- 不得仅因为 Chat 是开发工具就把所有文字设为等宽字体。
- 移动端可编辑控件不得小于 16px，避免 iOS 聚焦缩放。

推荐字号层级（v2.3 art 方向：阅读面行高取 1.7，字距 +0.002em，行长 42rem）：

| 角色 | 桌面 | Compact | 建议行高 | 实现 |
|---|---:|---:|---:|---|
| 元数据/辅助标签 | 11–12px | 12px | 1.35–1.45 | `--text-dim`，不承载关键信息 |
| 控件/正文 | 13–14px | 14–16px | 1.4–1.55 | 表单控件 14px/1.5 |
| 长文本/消息正文 | 14–16px | 16px | 1.6–1.7 | `.markdown-body`、`workspace-settings-content`、`catalog-detail` 共享 `--measure-prose:42rem`、`--rhythm-body:1.7`、`--tracking-body:0.002em`（`precision.css`）；消息列、运行状态与输入框共用同一列 `workspace-message-column` / `workspace-composer-column` |
| 区块标题 | 16–18px | 17–20px | 1.3–1.4 | `letter-spacing:-.02em` 仅限标题 |
| 页面标题 | 20–24px | 20–24px | 1.2–1.35 | 同上 |

- 字重以 400、500、600 为主；小字号不得使用过细字重。
- 同一层级字号差异必须有信息层级理由，不得通过连续的 1px 微调修补布局。
- 长消息正文应控制可读行长；代码、表格和日志允许独立横向滚动，页面整体不得横向溢出。
- 截断必须提供查看完整值的方法，例如 title、展开或详情页；关键错误和确认信息不得只显示省略号。

### 4.3 间距与布局

使用 4px 基础网格。优先值为：

```text
2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48
```

- 2px 和 6px 只用于紧凑的内部微调；页面和分组结构优先 8px 的倍数。
- 相邻触控目标建议至少保留 8px 间隔。
- 相关元素靠近，无关组通过更大间距、边界或背景分组；不得同时叠加重边框、重阴影和大间距。
- 主操作应靠近它影响的内容；固定工具栏不得遮挡内容。
- 面板必须设置合理的最小和最大尺寸；拖动调整后仍要保证主任务可用。

### 4.4 圆角、边框与阴影

| 角色 | 建议圆角 |
|---|---:|
| 小标签、代码内联、小型控件 | 4–6px |
| 桌面控件、普通卡片 | 6–10px |
| Compact 触控控件 | 12–14px |
| 移动 Sheet / 大浮层 | 18–22px |

- 同类组件必须共享圆角和边界处理。
- 阴影仅用于表达真实层级：菜单、Dialog、Sheet、拖拽对象。
- 浮层阴影必须使用全局 Token `--shadow-popover`（菜单、弹层）与 `--shadow-dialog`（模态 Dialog、命令面板）；两者都是"环境光 + 直射光"的多层阴影，不得在组件内自造单层或硬编码阴影。表面细边统一 `--surface-fine:color-mix(in srgb,var(--border) 82%,transparent)`（`precision.css`），常驻面板仍以背景 + 细边分层，不加漂浮重阴影。
- 常驻面板主要通过背景和边界分层，不使用漂浮卡片式重阴影。
- hover 不得使用导致布局移动的缩放；可以改变背景、边框、颜色或轻微阴影。

### 4.5 图标与资源

- 产品图标统一使用现有 Tabler Icons 或明确的品牌官方资源。
- 同一工具栏使用一致的视觉尺寸、描边和对齐方式。
- 图标按钮必须提供可访问名称和可发现的提示。
- 不使用 emoji、Unicode 图形或手绘 SVG 代替功能图标。
- 图片保持宽高比，并提供适当分辨率、alt 文本和加载失败状态。

## 5. 组件与交互状态

每个交互组件应根据适用场景覆盖：

```text
default → hover → focus-visible → pressed → selected
        ↘ disabled / loading / error
```

- hover、focus、pressed 和 selected 必须可以彼此区分。
- focus-visible 必须清晰，不能直接删除浏览器 outline 而无替代。
- disabled 必须同时禁止动作并解释无法操作的原因；仅降低透明度不够。
- loading 必须阻止重复提交，并保留按钮尺寸，避免布局跳动。
- selected 表示当前选择，pressed 只表示瞬时反馈，不能混用。
- error 必须说明发生了什么和用户下一步能做什么。

### 5.1 动作层级

- 一个局部任务区域默认只设一个主要动作。
- 次要动作降低视觉权重；低频动作进入菜单，但不能隐藏当前流程的必要动作。
- 危险动作必须使用明确动词和目标名称，不能只写“确定”。
- 可恢复删除优先进入移除区并允许恢复；永久清除等不可逆动作必须二次确认。
- 取消和关闭不能伪装成主要动作。

### 5.2 Dialog、菜单和 Sheet

- 打开后把焦点移入容器；Tab 不得逃出模态 Dialog；关闭后焦点返回触发点。
- Escape 关闭非破坏性的临时层；正在提交或存在未保存内容时必须明确处理。
- 点击遮罩是否关闭应保持同类组件一致，不能造成数据丢失。
- Compact 使用 Sheet 时，主要动作和关闭动作必须在安全区内并可单手触达。
- 菜单项使用动词或明确对象；分组和分隔必须表达真实关系。

### 5.3 表单

- 每个输入控件必须有持久标签；placeholder 不能代替标签。
- 错误靠近对应字段显示，并通过 `aria-describedby`、`aria-live` 或 `role=alert` 让辅助技术感知。
- 使用正确的 `type`、`inputmode`、自动完成和大小写设置。
- 校验时保留用户输入；后端错误不能被笼统替换为“操作失败”。
- 保存成功应通过状态变化或简短反馈确认；无变化时不得静默。

## 6. Agent 与异步任务体验

Chat 的核心不是一次性表单，而是可持续数秒到数小时的 Agent 工作。

- 用户动作必须在下一帧获得按下、选中或提交反馈。
- 超过约 300ms 的操作应出现忙碌状态；超过约 1s 应说明正在做什么。
- 会话暖切换必须保持视觉连续：已有数据不先换成加载页，联系人列不因短暂打开动作整体变灰，初始滚动应在首帧前完成；后台校验不抢历史阅读位置。不能仅用最终完成时间证明无闪动。
- 长任务必须显示 running、waiting review、completed、failed、cancelled 等真实状态，并提供适用的停止、重试或继续入口。
- 执行中在输入区上方展示紧凑状态行：旋转指示器、当前已确认阶段及计时。人工审核用静态等待提示；完成、取消、失败和无法确认必须停止假装工作中。工具卡片按实际执行事件/结果区分准备、执行、成功、失败与无结果，不能默认用成功样式。超过30秒无新进展时给说明，转圈不能代替服务端确认；减少动画时保留完整文字。正常结束恢复发送，并把完成状态、用量、工具次数和用时合并到回复末尾摘要；不在输入区上方重复一条完成提示。过程与统计通过同一入口展开。失败、取消和未知仍保持可见。停止请求未确认时显示“正在停止”。
- 流式文字可以低延迟显示，但完成后必须用持久 Session 数据校正；不得把前端临时状态当作最终事实。
- 会话初次载入及新消息、流式输出、工具动作到达时，消息区自动跟随最新内容；跟随期间延迟渲染、输入框和视口高度变化也应保持末尾可见。空闲时允许向上阅读历史，相同内容的刷新与历史分页不得抢回位置；下一次新活动恢复跟随。只滚动消息区，不移动整个网页或输入焦点，不使用连续平滑动画造成流式追赶。
- 乐观更新只能发生在 Backend 已接受且能返回稳定身份之后；滞后的列表读取不能抹掉更新较新的本地摘要。
- 断线后必须区分“任务仍在运行”“状态未知”和“任务失败”，不能把网络错误直接解释为 Agent 失败。
- 空状态必须解释当前为空的原因，并在存在合理下一步时提供动作。
- 错误信息至少包含：失败对象、可理解原因、数据是否保留、恢复动作。
- 后台任务完成通知不能泄露敏感内容；点击通知只能导航到同源合法地址。

## 7. 可访问性底线

目标为 WCAG 2.2 AA。所有新增或重做区域必须满足：

- 使用语义 HTML；标题层级、Landmark、列表和按钮不能只靠视觉模拟。
- 所有功能可通过键盘完成，Tab 顺序与视觉顺序一致，无键盘陷阱。
- 焦点始终可见，且不会被固定栏、Dialog 或虚拟键盘遮挡。
- 触控主要目标的可点击区域至少 44×44 CSS px；桌面紧凑控件不得牺牲可发现性和焦点区域。
- 文字支持至少 200% 放大，核心任务不丢失、不重叠、不要求页面整体横向滚动。
- 颜色不是唯一信息渠道；图标、文字和状态变化具备辅助技术名称。
- 动态状态与错误通过合适的 live region 宣告，但流式 Token 不应逐字打扰屏幕阅读器。
- 必须尊重 `prefers-reduced-motion`；减少动画后功能和状态表达仍完整。
- 自动动画不得闪烁，不得通过滚动劫持或视差妨碍阅读。
- 中英文和较长标签必须可换行或合理截断；不得依赖固定英文宽度。

## 8. 动效

- 动效只用于解释状态变化、空间关系和操作结果。
- 普通 hover/颜色过渡建议 100–200ms；菜单、面板和 Sheet 建议 180–300ms；大型主题揭示不得超过约 450ms。
- 不使用持续发光、无意义循环、夸张弹跳或大范围缩放作为默认反馈。
- 动画期间控件仍应保持可取消或避免接收重复动作。
- reduced-motion 模式下关闭位移、缩放、视差和扩散动画，只保留必要的即时状态变化。

### 8.1 动效 Token

时长与缓动统一使用全局 Token（`src/styles/tokens.css` 的 `:root`），新增 `transition`/`animation` 不得写魔法时长：

| Token | 值 | 用途 |
|---|---|---|
| `--duration-fast` | 120ms | hover/按压反馈、小元素入场、浮层提示 |
| `--duration-panel` | 200ms | 面板、侧栏宽度、Sheet 与空间关系变化 |
| `--duration-overlay` | 240ms | Dialog、命令面板等大型浮层揭示 |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 入场与反馈（元素从外进入） |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 常规状态过渡（对称进出） |

- 循环指示（spinner、脉冲）不属于以上三档，独立按场景设定。

### 8.2 浮层与遮罩动效

- **遮罩（scrim）**：所有压暗层共用一次淡入 `scrim-in`（`--duration-overlay` + `--ease-out`）；Radix 浮层再按 `data-state="closed"` 淡出 `scrim-out`（`--duration-panel` + `--ease-standard`）。禁止遮罩直接出现或消失（打开设置/对话框时"灰一下"就是这个缺陷）。
- **浮层本体**：`layer-in`（上浮 6px + 0.99 缩放）进入、`layer-out` 退出；Tooltip/Popover/DropdownMenu 使用小位移版 `ui-float-in`。
- **pressed 反馈**：使用 Token 背景（普通 `--bg-selected`，primary `--accent-pressed`），不使用 `filter: brightness()`；filter 会同时压暗图标与文字，观感是浑浊的灰色闪烁。
- 原生 `<dialog>` 的 `::backdrop` 在 `[open]` 时同样使用 `scrim-in`。
- **不引入动画库**（framer-motion、GSAP 等）：CSS Token + Radix Presence 已能表达现有动效；引入第二套动效系统会增加包体与维护面，违反 §2.2「克制一致」。
- 门禁：`lib/motion-contract.test.mjs`。
- 全局 `prefers-reduced-motion: reduce` 兜底把所有 `transition`/`animation` 压缩为瞬时状态变化；组件不得依赖动画时长维持逻辑正确（不要监听 `transitionend` 驱动卸载）。

## 9. 内容与术语

- 使用简洁、直接、可执行的中文；按钮优先使用动词。
- 稳定术语保持 `Project`、`Session`、`Workflow`、`Agent`、`Skill`、`Tool`、`Rule`、`Experience`，不要在同一界面随意翻译成多组近义词。
- 标题描述对象，按钮描述动作，状态描述当前事实。
- 确认文案说明对象、影响和可否恢复。
- 错误文案不责怪用户，不暴露无帮助的内部堆栈；技术详情可以折叠展示。
- 空状态不使用营销话术，应帮助用户理解当前上下文和下一步。

## 10. Frontend 与 Backend 边界

- Frontend 是纯浏览器客户端，只能通过 Chat HTTP API 使用认证、Session、文件、Workflow、Agent 和资源能力。
- 不得在 Frontend 加入 Node 文件系统访问、Pi SDK、AgentSession、Next.js 后端或第二套执行控制面。
- 页面组件不拥有服务端事实；可持久状态必须从 Backend 或 Pi Session 恢复。
- 所有 HTTP JSON 响应必须在网络边界进行运行时结构校验，不能仅依赖 TypeScript 类型断言。
- API 错误处理必须保留 HTTP 状态和服务端安全错误信息，并转成可恢复的页面状态。
- 请求应在页面卸载、目标切换或新请求替代旧请求时正确取消，避免旧响应覆盖新上下文。
- Service Worker 只缓存版本化静态资源和离线壳，不缓存 API 与实时事件。

## 11. 迭代和例外

### 11.1 修改前

Agent 或开发者必须：

1. 阅读本文、`frontend/AGENTS.md` 和相关组件。
2. 找到相似页面、组件、Token 和交互，优先复用。
3. 说明用户任务、目标平台、关键状态和不在范围内的内容。
4. 判断是局部收敛、组件扩展还是新的全局模式。

### 11.2 修改中

- 不通过堆叠硬编码修补不一致；重复模式应收敛为 Token、样式类、Hook 或组件。
- 不为了抽象而抽象；只有两个以上真实消费者或明确稳定合同才提升为公共组件。
- 改动必须覆盖 loading、empty、error、disabled 和权限不足等适用状态。
- 移动端不是桌面缩小版；同时检查触控、键盘、横屏、安全区和软键盘。

### 11.3 例外

偏离 SHOULD 或临时无法满足 MUST 时，变更说明必须记录：

- 偏离的规则；
- 具体原因和用户收益；
- 影响的平台与页面；
- 风险和补偿措施；
- 后续移除条件。

不得把一次页面例外复制成新的全局惯例。若例外反复出现，应先修订规范或设计基础设施。

## 12. 验收矩阵

### 12.1 每次 UI 变更

- [ ] 与现有组件和信息架构一致，没有新增无理由变体。
- [ ] 浅色和深色主题都可读，关键对比度达标。
- [ ] Compact、Medium、Expanded 至少各验证一个代表宽度。
- [ ] 鼠标、触控和键盘都能完成核心动作。
- [ ] hover、focus、pressed、selected、disabled、loading 和 error 的适用状态已检查。
- [ ] 无页面级横向溢出，长文本、代码和路径有明确处理。
- [ ] 200% 缩放、减少动画和较长中文标签不破坏核心流程。
- [ ] PWA 安全区、独立窗口和软键盘没有遮挡主要内容。
- [ ] 网络断开、请求失败和刷新恢复不会伪造成功或丢失持久事实。
- [ ] 新增 HTTP 响应有运行时校验，相关合同和布局测试已更新。

### 12.2 代表性视口

至少从以下尺寸选择与改动相关的组合：

```text
360×800   Compact Android / 窄屏 PWA
390×844   Compact iPhone / PWA
768×1024  平板或窄桌面
1024×768  Medium/Expanded 工作区
1440×900  Expanded 桌面
```

涉及输入时增加软键盘打开状态；涉及 PWA 时增加 standalone；涉及主题时验证 light、dark 和 auto。

### 12.3 证据

- 视觉或布局变化必须保留修改前后截图，使用相同视口、主题和状态比较。
- 交互变化必须以可复现步骤或测试证明，不以静态截图代替。
- Frontend 修改至少运行 `pnpm test`、`pnpm typecheck`、`pnpm build`；由 Chat 父仓库集成时还要遵守根 `AGENTS.md` 的完整验证。

## 13. 规范维护

- 本文是完整规范事实源；Rule 只引用本文并声明执行入口，不复制全文。
- 全局 Token、响应式分层、核心组件状态或 PWA 行为改变时，必须同步更新本文。
- 页面专用规则只记录真正的局部差异，未声明部分继承本文。
- 规范变化必须说明动机、影响范围和迁移策略；不能仅替换数值而不解释语义。
- Product Design 审计可用于发现真实页面偏差；自动化测试负责守住可机器验证的合同，两者不能互相替代。

### 13.1 朋友圈的局部视觉约定

2026-09-12 根据用户明确的 Instagram 风格需求，朋友圈采用横向头像作者筛选和单列动态阅读面。该导航直接服务于筛选，允许在其自身区域横向滚动；页面正文仍不得横向溢出。这是第 2 节工具页面原则在社交阅读场景中的限定例外，不引入限时 Story、未读状态或装饰性内容。主要风险是长名字截断，使用完整可访问名称、悬停提示、选中作者标题及帖子署名补偿。若取消按作者浏览的需求，应一并移除该横向导航。具体行为与回归入口见[开发指南 §1.2](./development.md#12-朋友圈阅读界面)。

## 14. 外部参考

以下资料提供原则和交叉验证，不构成对任一厂商设计系统的整体采用：

- [W3C Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [Adobe Spectrum Principles](https://spectrum.adobe.com/page/principles/)
- [Adobe Spectrum Platform Scale](https://spectrum.adobe.com/page/platform-scale/)
- [Adobe Spectrum Spacing](https://spectrum.adobe.com/page/spacing/)
- [Adobe Spectrum States](https://spectrum.adobe.com/page/states/)
- [Google Material Design 3](https://m3.material.io/)
- [Material Design Interaction States](https://m3.material.io/foundations/interaction/states/overview)
- [Material Design Canonical Layouts](https://m3.material.io/foundations/layout/canonical-examples/overview)
- [Microsoft Fluent 2 Color](https://fluent2.microsoft.design/color)
- [Microsoft Fluent 2 Layout](https://fluent2.microsoft.design/layout)
- [Apple Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)
- [Apple UI Design Dos and Don'ts](https://developer.apple.com/design/tips/)
- [Meta Engineering: HIKE Accessibility Primer](https://engineering.fb.com/2015/11/23/web/hike-our-quick-simple-accessibility-primer/)
- [web.dev: Learn Progressive Web Apps](https://web.dev/learn/pwa/welcome)
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)（MIT）：交互质量门禁来源，适配版见 [.agents/skills/web-design-guidelines](../.agents/skills/web-design-guidelines/SKILL.md)。
- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills)（MIT）：React 性能门禁来源，适配版见 [.agents/skills/react-best-practices](../.agents/skills/react-best-practices/SKILL.md)。

## 15. 已实施的新工作区基础参数

工作区以统一外壳呈现 Friend、项目、动态与设置。全局导航不隶属于项目；顶部项目为交流上下文，Friend 与项目可独立切换。动态、设置返回交流时保留原会话。

- 桌面导航 64px，列表默认 280px（224–360），资料默认 360px（320–720），资料默认折叠；主交流区域保留至少 480px。可见内联面板各计 1px 分隔线。
- Expanded ≥960px；面板容纳不下时先收资料、再收列表，仍不足则资料覆盖显示。Medium 使用抽屉，Compact 延续宽度 ≤768px 或粗指针短横屏规则，采用底部 64px 导航与单屏内容。
- 项目选择、交流标题和操作合为唯一 48px 顶栏，短横屏可收紧到 44px；Friend 行最小 64px，按名称、简介和真实状态自适应增高，头像 40px。消息正文 16px/27px，输入 16px/24px，内容列上限 880px、正文段落上限 800px。
- 明暗均用暖中性底色、紫色强调；背景、正文、弱文字、控件边界、强调按压及成功/警告/错误分别使用语义 Token。`--on-accent` 用于强调底色上的文字，不固定写白色。
- 控件 hover 120ms、面板 200ms；焦点为 2px 强调色外轮廓，粗指针主要目标至少 44px，减少动画偏好关闭动效。
- 拖拽、键盘调整和双击复位保留；临时窄屏尺寸不覆盖用户偏好。宽内容模式在设置中切换，正文段落仍限 800px；模态层提供焦点循环与 Escape 关闭。实际验证平台和剩余限制见父仓库验收记录。

粗指针短横屏（高度 ≤500px）将项目条/交流标题收紧到 44px，底部导航 48px 并仅视觉隐藏标签（保留可访问名称），为历史留出空间。点击目标仍至少 44px；不删除入口。

### 15.1 参数来源与统一控件

列表 280px 参考 LobeHub 的聊天侧栏和 Cherry Studio 相近的助手栏；OpenBot 的两行对象摘要与 OpenWork 的紧凑工作侧栏用于校验信息密度。Chat 结合中文内容、64px 独立导航、480px 主内容保底和可折叠资料，取自己的尺寸组合；不平均四家数值，不导入它们的 UI 框架。原核查固定版本链接在父仓库 `docs/modules/web/chat-web.md`。

- 字体变量由 `src/styles.css` 定义：`--font-sans` 用于 UI/说明，`--font-mono` 用于代码/路径。旧 `--bg-secondary` 仅作为 `--bg-panel` 的兼容别名，新样式直接使用语义名。
- 设置区域根使用 `configuration-dialog`，原生 Workflow/Prompt 对话框使用同一基础控件规则。普通表单控件 14px/1.5、最小高 36px，字段标签 13px、区块标题 14–18px，说明 12px。Compact 可编辑控件 16px、点击目标至少 44px。复选/单选框不套文本框尺寸。
- 开关复用 `ConfigurationToggle`：44×44px 点击区域内居中显示 40×22px 轨道，使用 switch/aria-checked 和禁用语义；不能直接将轨道撑高到按钮尺寸。
- 生效值与来源放在次级信息组；模型选项显示名称和 Provider，完整标识可查看。字段说明表达作用范围与保存时点，重置是次要动作，不能挤成一大行裸文本。
- 结尾摘要使用 12px 元数据、轻背景/细边界，桌面入口最小高 32px，触控 44px，可换行。默认保留回复正文，展开用量分项和原过程；不估算缺失 Token，不伪造耗时或成功。
- 主按钮前景用 `--on-accent`；错误与成功使用各自语义文字/背景，不能在暗色主题仍固定白字或硬编码亮红。

### 15.2 页面与浮层模式

- 设置采用“分类导航 + 当前分类内容”，区分外观、个人能力与记忆、项目资源、辅助操作。资源分类明确上下文；设置和动态不显示 Session 顶栏。
- `SurfaceDialog` 统一只读目录/历史：标题 16px、说明 12px、固定关闭入口、内容单独滚动；桌面目录宽 960px、阅读器上限 1440px，距视口边至少 24px；Compact 全屏并留安全区。表单继续保留自己的未保存策略，不强行替换成无状态阅读 Dialog。
- Tools 和 Prompt 采用列表/详情；Compact 一次显示一个面板，通过“返回列表”返回。目录加载失败带重试；部分资源诊断显示在目录级，技术详情折叠。工具描述不替代实际配置检查。
- 完整历史保留 Pi 数据和树浏览，浏览器适配字体、语义色、280px 树栏及触控目标；沙箱保持不允许 same-origin，不能为主题接入而扩大权限。导出保留原文件。
- Friend 管理、Memory、设备状态沿用同一字体与语义色，辅助信息最低 12px；路径/代码等宽。Friend 管理 Header 支持动作换行，移动端不能直接隐藏归档/刷新等能力。
- 目录选择、移除区和请求诊断使用 `useDialogFocus`，Escape 与 Tab 归属当前浮层；多级编辑保留各自关闭确认。
- 图片、Mermaid、动态属于内容阅读器；不强行套普通表单框。扩展 ANSI、语法高亮、头像派生色属于内容表达，不能简单全文替换。

离线页不依赖应用 Bundle，保留一份与主题 Token 对齐的最小静态外壳；尊重本窗口主题偏好，auto/存储不可用时跟随系统，重试按钮至少 44px。`offline-theme.test.mjs` 验证主题恢复，不将离线误报为 Agent 执行失败。Session 统计使用静态面板，不添加入场模糊或扫光。

## 后台任务侧栏

后台任务通过与 Agent 对话，由已有 `friend_work` Tool 创建；侧栏仅提供当天会话/任务的阅读、继续与停止。移除创建加号与名称/说明表单，使用“在对话中安排后台任务”进入当日日常会话并聚焦输入框，不自动填入或发送提示词。日常对话标题只显示一次，任务区与日常区有明确间距。

任务成果位于所属长期任务、定时任务或后台任务详情，按 Backend 的 dutyId/taskId/workId 关联，不按标题/日期猜测。一次任务可有多次执行、多项成果；成果历史版本保留同一来源。后台任务用量来自原生 Session 累计（含继续交流、压缩与分支摘要），不是当前剩余上下文。助手用量汇总在助手设置内作为次级概览，按助手时区统计；包含日常会话，不能冒充某个任务的用量。

### 共用导航与组件

- 面向用户保留“助手设置、长期任务、定时任务、助手记忆”；身份与长期指令并入助手设置。内部 Duty、Artifact、Nano Agent Group 不成为“职责、交付、智能体组”顶层栏目。
- 朋友圈、群聊与主题使用既有全局入口。群公共会话与成员参与会话分别有唯一 Session ID/存储归属，关系由 Backend 提供；从历史点击成员参与记录回到所属群聊，不按执行助手误跳私聊。
- 全局设置、朋友圈、群聊、主题和助手设置复用 `PageHeader`，返回位于左上。全局页“返回交流”直接回保留的交流；助手浮层“返回”关闭当前浮层并保留原页面。浏览器返回继续遵循浏览器历史。
- 动作使用 `components/ui/Button` 的 primary/secondary/ghost/danger；选择行保留列表语义。按钮边框、间距、焦点、禁用与触控尺寸由共用 Token 和样式控制，页面不重新定义一套。
- `SurfaceDialog` 使用 Radix Dialog；业务确认统一使用 Radix AlertDialog 与 `ConfirmationProvider`，不使用 `window.confirm`。保留业务未保存/并发处理，取消默认聚焦、Escape 取消，关闭回触发点；没有保存确认不得丢弃编辑。旧编辑页焦点 Hook 在嵌套公共 Dialog 打开时让出焦点。

## Friend 历史日历

全年绿色格子表示当天有原生消息记录，空会话不点亮。按月日历提供至少 44px 的日期入口，空日期无绿点但可点击，打开或幂等创建所选日期的会话；点击任意日期直接进入当日工作区，由侧栏显示当天会话和后台工作（含开始时间），中央复用共享聊天；同日条目切换保留日期，点击 Friend 回到今日。整年总览为紧凑密集索引，触摸设备扩大格子并仅允许该索引局部横向滚动。年月导航、时区、错误和关闭入口始终可发现。未来颜色深浅按真实每日 Token 用量；当前统一绿色，不暗示任务成功或强度。打开历史沿用主会话界面并能在原 Session 继续交流，不制造第二套消息展示。创建空会话不表示已经有活动，也不自动运行模型或安排定时任务。

会话记忆是输入工具栏内的笔记图标入口，有可访问名称；记录开关与条目管理放在同一记忆 Dialog 内。顶栏"项目"选择器、聊天区、输入工具栏共同分配可用高度，不能将额外标题/工具行叠在 100% 高度聊天区之外。验证完整工具栏的边界，不只验证输入框出现。

## 16. 从功能合同到界面验收

2026-09-27 补充。现有组件并不因本节发布而自动完成整改。当前偏差、页面范围和证据见父仓库 [交互与 UI 审计](../../docs/history/reviews/2026-09-27-product-interaction-ui-audit.md)。本节收敛设计与验收方法，不改变 Backend 的授权、Session 归属或执行语义。

### 16.1 参考体系的分工

布局主要参考 **LobeHub 与 Cherry Studio**，固定版本证据沿用 §15.1 与父仓库 Chat Web 文档。OpenBot、OpenWork 用于对象、执行和恢复机制的交叉验证，不构成另外两套视觉语言。

| 参考 | 在 Chat 中借鉴什么 | 落到什么验收对象 |
|---|---|---|
| Google Material | 列表—详情、辅助面板及响应式布局 | 同一个对象在宽屏与窄屏均可选择、阅读和返回 |
| Adobe Spectrum | 控件状态、密度、分组和动作层级 | hover、focus、selected、pending、disabled、error 各自可辨认 |
| Microsoft Fluent | 中性色层级、语义颜色和 Token | 明暗主题共用颜色角色；状态色不作无意义装饰 |
| Apple HIG | 控件可发现性、触控、清晰内容与对齐 | 主要内容不靠缩放才能阅读；触控遵守本规范的 44 CSS px 底线 |
| Meta HIKE | 语义 HTML、键盘和辅助技术检查 | 标签、焦点、输入名称、状态宣告可验证 |

这些资料是依据，Chat 的尺寸、颜色角色和组件合同仍以本文为准。不能把不同厂商的按钮、圆角和配色直接拼接；Meta HIKE 是无障碍资料，不应称为已采用的完整 Meta 设计系统。

### 16.2 每个任务界面必须回答的问题

设计顺序为 **功能与状态 → 交互路径 → 视觉呈现**。实施前在任务方案中回答以下问题，不另建一套产品事实源：

| 层次 | 必须明确的内容 |
|---|---|
| 对象 | 当前 Friend、Project、Session、群、主题节点分别是谁；浏览上下文与实际执行目标是否不同 |
| 动作 | 点击是进入、筛选、查看、编辑，还是会启动执行；是否有副作用，何时才算接受 |
| 状态 | loading、已确认空、错误、未知、进行中、完成如何区分；来自哪个 Backend 合同 |
| 连续性 | 快速切对象、刷新、前进后退、离开再返回后，选择、草稿、历史和执行分别如何恢复 |
| 恢复 | 重复点击、响应丢失、旧请求晚返回、断线重连时，怎样避免重复执行或显示错对象 |
| 呈现 | 一个局部主动作，次要动作归位；列表、标题、正文、工具栏和浮层使用已有模式 |

“发送消息”和“让 Agent 开始响应”若是两个不同操作，必须用用户可理解的名称与状态解释两者关系。不得仅用后端枚举名称要求用户推断执行语义。是否合并操作须先核对业务合同，不能只改按钮文字。

页面选择可以是浏览器状态；它不能成为服务端事实。旧对象的响应不能覆盖新对象，提交后的返回也不能清空新对象草稿。连接失败不能同时显示未经确认的“暂无记录”；若保留已读记录，明确标注更新时间或不可确认状态。

### 16.3 页面模式与组件约束

- 导航入口进入任务工作区；管理面编辑身份、策略、权限或资源。两个入口若展示同一对象，必须明确分工，不重复实现发送与恢复状态机。
- 公共历史与成员参与记录应明确名称和范围。低频记录入口放在局部菜单或详情中，不按成员数量堆叠主页面工具行。
- 相同 Session 的记忆管理默认复用一个入口与同一操作合同；页面辅助栏不得再提供含义相同但开关位置不同的管理路径。
- 任务定义、一次触发、一次后台执行分开辨认。列表优先展示可理解名称、时间和真实状态；稳定 ID 在详情可查，不按同名标题去重不同执行。
- 表单需同时显示作用范围与保存时点；“自动保存”“本次运行”“下次运行生效”不得互相矛盾。
- 无记录时引导当前任务；加载失败时提供恢复。低频维护操作与内部实现说明放在次级详情，不占据主任务首屏。
- 响应式优先复用 §3.2 的分层。不能以隐藏唯一入口完成适配，也不能把全部桌面区域堆叠后挤没主任务；通过最终 computed style 和实际内容高度确认 CSS 的生效结果。

### 16.4 完成条件与计数

每次界面变更先验收对象、动作、接受与恢复，再验收布局和样式。至少保留一个正常场景、一个关键失败/竞态场景以及相关视口截图；主题变化增加两种主题的有效状态对比度。测试通过、元素存在、按钮可点击，都不能单独证明流程合理。

审计报告必须说明“页面”的计数单位。全局入口、独立任务面和弹窗可以列入同一清单，但同一界面的每个按钮不能另算一页。功能、交互、视觉分类允许重叠；区分实机观察、源码确认、待运行复现以及未覆盖状态。未发现问题不等于全部状态通过，之前的门禁数量也不自动成为新界面的视觉验收证据。


## 17. 全面更新基线（2026-09-27）

本节是上述原则的组件与页面落地合同，不是第二份设计系统。主要开源布局参考仍为 LobeHub 和 Cherry Studio；Google、Adobe、Microsoft、Apple 与 Meta 的参考分工见 §16。采用自身品牌色，不逐页混合各家的视觉皮肤。

### 17.1 明暗主题与尺寸

| 角色 | 浅色 | 深色 |
|---|---|---|
| 页面 / 面板 | `#FAF9F7` / `#F2F1EE` | `#1C1B20` / `#242329` |
| 正文 / 次文字 | `#29272E` / `#605C69` | `#EEEDF2` / `#BDB7C8` |
| 弱文字 | `#6C6673` | `#ACA5B7` |
| 强调 / 强调底上的文字 | `#6551B8` / `#FFFFFF` | `#BEB0FF` / `#251D40` |
| 选中背景 | `#EEEAF9` | `#363047` |
| 控件边界 | `#898290` | `#817889` |

全局 `--radius-control:10px`、`--radius-panel:14px`、`--radius-dialog:20px`（v2.3 起为唯一圆角体系；工具栏图标、按钮、输入、浮层全部对齐，禁止 5/6/8/9px 自创值）。列表可保留紧凑圆角；浮层使用共享阴影，普通内容不逐卡加投影。消息列 `workspace-message-column`、运行状态与输入框 `workspace-composer-column` 共用同一个 `var(--conversation-measure,var(--measure-prose,42rem))` 和同一条居中轴（右侧 `--composer-gutter:36px` 为 ChatMinimap 预留，Compact 置 0）；`--conversation-measure` 只由顶栏宽度滑杆写入（§20.7），默认自适应。只改一侧、或给输入框硬编码像素宽度，会让消息区与下方输入框出现两条宽度和中心都不同的边（本轮缺陷）。宽屏模式仍是显式 opt-in，打开时消息列与输入框一起放宽。普通表单输入 40px、按钮至少 36px；Compact 主要触控 44px，输入字 16px。隐藏 radio 不继承可见输入的最小高度。

离线页、Manifest 启动画面与应用采用同一基础色。状态颜色使用已有 success/warning/danger 角色；diff、工具错误与成功反馈同样遵守明暗主题。品牌标记、用户头像、图片、代码高亮保留其内容语义，不能机械替换。

### 17.2 选择与配置

- `SearchSelect` 是离散选择：输入只过滤候选，不保存任意文字。持久标签、当前值、候选名称与说明都可读；Arrow/Enter/Escape/Tab 支持选择与退出。弹层用 top layer，按可见视口向上或向下展开，不能被滚动容器裁切。模式参考 [WAI-ARIA Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)。
- 模型选择显示模型名、Provider、ID 与认证可用性；不可用当前值保留并说明，不能静默改选。不能把“未选择”与“继承默认”混为一谈。
- `ThinkingSelection` 使用有标签的单选组；可用等级来自 Backend/Pi 对当前模型的能力投影，不以一个全局枚举假设所有模型都支持最高等级。继承选项独立，旧的不受支持配置显式提示，不自动覆盖。
- Provider 编辑器按连接、模型能力/规格、高级设置分组；价格与高级兼容项折叠。模型参数与运行时等级选择是两个不同任务。保存配置影响后续运行，不宣称改变在途运行。
- 设置通过 `view=settings` 与 `settings` 恢复类别；项目资源在本页显式选项目。外观使用浅色/深色/跟随系统明确选项，语言与内容宽度同样显示当前值，避免循环点击猜测。

### 17.3 六个任务面与共享入口

| 页面族 | 主任务及次级内容 |
|---|---|
| Friend / Project | 中央共用会话；日历点击直接定位当天，侧栏显示当天会话与工作；后台执行以可读名称、时间、状态区分，不按标题去重 |
| 动态 | 单列阅读、作者/时间和评论层级；筛选不改变作者事实 |
| 群聊 | 公开消息和发布输入为主；一个历史入口容纳群公共与成员参与记录；发言策略与“开始讨论”明确分离；咨询/后台工作收在次级区 |
| 话题 | 图与节点会话；窄屏一次一个主任务面；记忆只经共用会话记忆入口，来源/锚点留在节点资料 |
| 全局设置 | 外观、个人资源、项目资源、辅助操作四类；栏目与具体资源编辑分层 |
| Friend 管理 | 左侧 Friend 选择与纵向栏目，右侧表单；窄屏栏目网格；群/话题管理进入对应工作区，不能再嵌一套聊天 |
| 资源与阅读器 | Tools/Skills/Prompt/Plugins/Extensions 复用目录与编辑表面；历史、文件、统计、设备状态沿用主题、焦点、关闭和滚动合同 |

对已确认属于群的项目 Session，Backend 提供 `groupConversation` 导航关系，列表标“群聊/成员参与记录”并进入群。该关系不改变执行 owner、不扩大授权，不通过标题或消息正文猜测关系。

### 17.4 状态与恢复

加载中、真实空集、无法确认、失败不可混用。任务/职责投影失败不显示“暂无数据”；活动计数呈现实际轮次和会话数量。群选择切换清掉旧展示，旧请求不得覆盖新目标；消息草稿按群隔离，确认只清除提交的原草稿。未确认重试复用原请求 ID 与内容。EventSource 临时断线继续重连，并以读请求补齐状态；撤销访问停止连接。

会话记忆修改使用 revision 冲突检测；冲突时保留编辑稿并重新读取当前版本，让用户比较后再保存。成功、失败、重试和维护动作靠近所属内容。Memory 搜索有持久标签，“重建索引”等维护动作居次级，不抢占记录管理。

### 17.5 验收纪律

每次更新记录：对象/状态合同、实际页面/尺寸、键盘/焦点、明暗颜色与验证结果。30 个任务区域是覆盖索引，不是“30 个页面全状态已验收”的证明。全局主题生效不等于所有页面人工通过；测试数量也不能代替界面证据。截图保存在忽略验证目录，避免把真实会话内容提交到仓库。未测试的真实设备、在线 Provider 和权限流程明确列出。

模型由显式值改为尚未保存的继承值时，不能沿用旧模型的能力作承诺；先保存并由 Backend 解析默认模型，再呈现其等级。停止重试只清除本机重试状态，不等于取消已经接受的服务端工作。资源目录的选择和展开使用原生按钮及选中/展开语义，不能只有鼠标点击事件。

聊天侧栏和资料面板进入全局任务页时，不仅内容隐藏，其遮罩也必须移除且不截获指针。验收应覆盖中等宽度直接进入设置等深链接，并以实际命中和指针操作证明可用。

会话列表在小于 960px 的中等视口也使用抽屉。所有抽屉模式在直接进入会话、切换会话时默认收起，不能只处理小于等于 768px 的手机断点；同一会话的数据刷新不关闭用户手动展开的列表。至少用 800×513 的真实指针检查会话记忆入口，再覆盖手机与宽屏布局。

### 17.6 界面语言一致性

界面默认使用英语，与操作系统及浏览器语言无关。设置 → 外观 → 语言提供英语、简体中文两项明确选择，选中项即时生效，以浏览器 `pi-locale` 保存；刷新保留显式选择，缺失、无效或无法读取时回到英语。语言是设备上的界面偏好，不写入模型、项目或 Agent 配置。

所选语言覆盖导航、表单、模型与思考等级、占位提示、辅助说明、状态、错误摘要、弹窗、无障碍名称及时间/数字格式。中文使用“项目、会话、工作流、智能体、长期助手、服务商、提示词、工具、技能、扩展、插件”等统一术语，不能用英文产品通用词拼接中文句子。品牌、API/OAuth 等协议名称、路径、模型 ID、资源地址保留原值。

用户消息、生成结果、自定义名称、资源正文、工具输出与原始诊断属于内容，切换界面语言不改写它们。未知服务端错误提供本地化的错误摘要及“详情”入口，保留完整诊断以便排查，不能臆造具体解决办法。完整历史阅读器的控件随当前语言，Pi Session 数据及执行脚本保持原样；离线页也使用相同偏好。

交付门禁：中英文键及参数必须对齐；组件自有文案不得绕过语言包；至少验证中文浏览器中的默认英文、双向切换、刷新记忆、模型设置和离线页面。新增状态与控件必须同时补齐两种语言。

## 18. 设计精度基线与交互一致性合同（2026-09-28）

本节沉淀全局视觉精度与交互一致性机制，全部实现位于 `src/styles/`（2026-09-28 起拆分为 tokens/base/components/workspace/precision 五层，`src/styles.css` 是保持级联顺序的 `@import` 聚合入口；设计精度基线在 `precision.css`）及 `components/ui/` 共享原语。它们回答一个反复出现的问题：**为什么每个页面的交互逻辑看起来不一样？** 答案不是逐页调整，而是把全局体验收敛到同一批机制，任何新页面默认继承。

### 18.1 全局视觉基线

以下均已在 `src/styles/` 全局生效，组件不得绕过或重复定义：

- **`color-scheme`**：`html` 按主题声明 `light`/`dark`，原生滚动条、表单控件和浏览器 UI 与主题一致。
- **文本选区**：`::selection` 使用强调色的弱化底（accent-wash），明暗主题分别调校。
- **焦点环**：全局 `:focus-visible` 默认 2px 强调色外轮廓（含 `--focus-ring` 相关声明）。组件只在特殊背景上覆写颜色，不得删除焦点指示。
- **滚动条**：Firefox `scrollbar-width: thin`；webkit 内核统一窄滚动条与 hover 反馈。
- **分层阴影**：`--shadow-popover`、`--shadow-dialog` 为多层（环境光 + 直射光）阴影，见 §4.4。

### 18.2 代码呈现

代码高亮统一使用 Shiki（`lib/highlight.ts`），替换旧的 `react-syntax-highlighter`：

- **双主题**：vitesse-light / vitesse-dark，输出携带 CSS 变量，由 `html.dark` 切换；切换主题不重新高亮。
- **按需加载**：语法与 WASM 引擎懒加载为独立 chunk；`HIGHLIGHT_LANGUAGES` 之外的语言渲染纯文本，超过 120K 字符降级纯文本，结果走 LRU 缓存。新增语言在 `LANGUAGE_LOADERS` 加一行，不引入新的高亮库。
- **文件查看器行合同**：transformer 把每行改写为 `.file-source-line[data-line-number]` + `.file-source-line-content`；行号由 CSS counter 伪元素渲染（不可选中）。行选择、`@` 引用行号逻辑依赖该结构，改结构必须同步 `FileViewer` 的选择逻辑与测试。
- **聊天代码块**：非流式用 `components/ui/SourceCode.tsx`（`.markdown-code-source`），流式期间用纯文本 pre（`.markdown-code-streaming`），完成后替换为高亮版本。

### 18.3 全局反馈与命令入口

- **Toast**：统一经 sonner 的 `components/ui/FeedbackToaster.tsx`（挂载于 `DeviceWorkspaceRoot`），主题跟随全局 `useTheme`，位置含 `--safe-area-bottom`。复制失败等非阻断反馈使用 `toast.error(t("interface.copyFailed"))`；**错误合同不变**：阻断性错误仍用 `role=alert`/`InterfaceFeedback`，toast 只承担非阻断反馈，不承担恢复路径。
- **命令面板（⌘K）**：`components/ui/CommandPalette.tsx` 基于 cmdk，定位为**导航专用**入口（新会话、返回交流、动态、群聊、话题、设置、切换主题）。所有命令经 AppShell 既有回调执行，不得在面板内实现第二套控制逻辑。有模态 Dialog 打开时 ⌘K 不抢占；文案使用 i18n 双语键（`interface.palette.*`）。
- **i18n**：以上所有用户可见文案按 §17.6 补齐中英双语键。

### 18.4 交互一致性合同

新页面/新组件使全局体验保持一致的机制清单。**默认继承，而不是重新发明：**

| 需求 | 使用机制 | 禁止 |
|---|---|---|
| 全局任务面（Friends/Projects/动态/群聊/话题/设置） | 全屏页 + `PageHeader` 返回；左侧 rail 可直接切换，不强制先点返回；返回时恢复进入前的侧栏状态 | 再套 Dialog、强制先点返回才能切换 |
| Friend 任务与归档（`FriendInspector`） | Friend 会话的顶栏不再显示会话名，改为**按用途命名**的工具栏动作（“任务与归档”，`ToolbarAction`，`aria-expanded`），展开/收起**会话区左侧的全高区域**（与“项目资料”同级：同样整块、同样独立滚动）；区域按日分块，块内先“会话”（像项目会话列表那样直接列出名称/类型/时间）再“任务”（任务/职责/执行 徽标），今天永远第一；更早日期在悬浮日历浏览后**选中才加入**，可逐日移除 | 半高横条、与会话列左右错位的触发点、重复左侧已有的头像/名称/简介、用会话标题当按钮名、把整年日历塞进区域 |
| 临时配置（单个 Friend/资源/模型/记忆/Tools） | `SurfaceDialog`（`wide` 按需），Compact 自动全屏 Sheet；右上 X + Escape 关闭，不用 `Back` | 全屏 portal 页、自制 overlay、自制焦点陷阱 |
| 模态确认 | Radix AlertDialog + `ConfirmationProvider` | `window.confirm`、自制遮罩 |
| 只读目录/历史弹层 | `SurfaceDialog` / `useDialogFocus` | 手写焦点陷阱 |
| 会话列左侧的任务与归档区域 | 与“项目资料”同级：同一个 `.workspace-dock` 原语（宽度过渡 + 固定内宽 + class 开合），全高、独立滚动、触发点与区域同侧 | 半高横条、瞬现无过渡、条件渲染导致无法动画、左右错位的触发点 |
| 图标按钮/截断值提示 | `components/ui/Tooltip.tsx` 的 `Hint`（触发元素保留自己的 `aria-label`） | 依赖原生 `title` 作为唯一提示、tooltip 内容承载关键信息 |
| 锚定非模态弹层 | `components/ui/Popover.tsx`（内容统一 portal + `.ui-popover`） | 组件内自制 outside-click/定位逻辑 |
| 动作菜单 | `components/ui/DropdownMenu.tsx`（键盘导航、Escape、outside-click 由 Radix 提供） | 手写 `role="menu"` + outside-click 监听 |
| 非阻断反馈 | sonner toast（`FeedbackToaster`） | 第二套通知/横幅机制 |
| 全局导航快捷入口 | `CommandPalette`（经 AppShell 回调） | 面板内自带执行逻辑 |
| 全局快捷键 | `useKeyboardShortcuts` / AppShell 统一监听 | 组件内散落 `keydown` 监听 |
| 阴影/圆角/焦点环/选区色 | §18.1 全局 Token 与基线样式 | 组件内自造阴影、删除焦点指示 |
| 代码高亮 | `lib/highlight.ts` + `SourceCode` | 引入其他高亮库 |
| 主题切换 | `useTheme`（含 View Transition） | 组件内直接操作 `documentElement.classList` |
| 过渡时长与缓动 | §8.1 动效 Token | 魔法时长（`0.12s`、`150ms` 等） |

浮层机制说明（2026-09-28）：Tooltip / Popover / DropdownMenu 三个薄包装共享 `.ui-tooltip` / `.ui-popover` / `.ui-menu` 浮层表面（`precision.css`），统一 z-index、圆角、`--shadow-popover` 阴影与 `--duration-fast` 入场动画，Provider 挂载于 `DeviceWorkspaceRoot`。已有自制浮层按同一合同逐步收敛（DeviceSwitcher 已迁移）；移动端 Compact 的底部 action sheet 属于 Sheet 模式（§5.2），不按菜单收敛。

判定方法：实现一个新界面时，若上表中的需求出现了**第三种实现方式**，先停下来——要么复用既有机制，要么在本文新增合同并迁移旧实现，不允许并存。

Friend 会话的顶栏用“任务与归档”动作取代会话名标题（后端会话名`<agent> · <date>`只在会话列表/历史里出现）；区域在会话列左侧、全高、独立滚动，触发点与区域同侧。区域不得重复左侧已有的身份信息。

日期交互：**今天永远显示**，块头给出该日会话/任务计数，每天都提供“打开这一天的日常会话”（空日期打开时幂等创建）；要看过往，在区域内的“从日历添加日期”打开悬浮日历（浏览模式，选中日期不会切换当前会话），选中后才把该日加入区域；加入的日期可单独移除（上限 7 天），选中后发现为空也保留并给出空状态，不能静默消失。区域内只有“打开这一天的日常会话”、点会话行、以及点有原生 Session 的执行行才会真正导航；计划行没有可打开的会话，不做假交互。

信息组织：每天先“会话”后“任务”，任务按 任务/职责/执行 标注类别徽标，并显示真实状态、项目名与时间；计划行显示下次时间，执行行显示发生时间。无内容时给明确空状态，不用“暂无数据”糊过去。`LongAgentTasksPanel` 仍是任务/职责/执行的唯一完整列表。

### 18.5 视觉精度合同（v2.3 art 方向）

在暖灰 + 墨字 + 克制紫品牌内做到画廊级精度，不引入新色板与装饰：

| 需求 | 使用机制 | 禁止 |
|---|---|---|
| 阅读行长与节奏 | `--measure-prose:42rem` 为默认值，`--conversation-measure` 为顶栏滑杆写入的用户值（§20.7）、`--rhythm-body:1.7`、`--tracking-body:0.002em`（`precision.css`）；`.markdown-body`、设置正文、目录详情共享；消息列、运行状态与输入框（`workspace-composer-column`）严格共用同一变量、同一居中轴与同一 `--composer-gutter` | 逐页自定行长、连续 1px 字号微调、只给消息列或输入框单独设宽度、给输入框再写一个像素上限、绕开滑杆直接写会话宽度 |
| 表面分层 | 常驻面板背景 + `--surface-fine` 细边；浮层才用 `--shadow-popover` / `--shadow-dialog` 两档 | 常驻内容逐卡加投影、自造单层阴影 |
| 圆角 | `--radius-control:10px` / `--radius-panel:14px` / `--radius-dialog:20px` 唯一体系 | 5/6/8/9px 自创值 |
| 语义色 | `--on-accent`、`--danger`、`--success`、`--warning`、`--accent`；t/s 徽标用 `--bg-selected` + `--text-muted` | `v2.3 §4.1` 所列硬编码色直写 |
| 动效 | `§8.1` 三档时长 + 双缓动；Dialog 入场 `surface-dialog-in`（`--duration-overlay` + `--ease-out`，上浮 6px 缩放 0.99） | 魔法时长、持续发光、弹跳、大缩放 |
| 嵌套浮层 | 主 Dialog 共享 overlay 1100 / 内容 1101；嵌套 picker/editor 提到 1110 并保留各自焦点域 | 与主层同 z 抢焦点 |
| 定位陷阱 | Dialog 内禁止 `position:fixed + 全屏侧栏偏移`（如 `left:min(240px,…)`）；必须锚到对话框盒（`relative + absolute`） | 把全屏页 footer 样式直接搬进 Dialog |

### 18.6 门禁 skill

本文是"长什么样"的事实源；交互与性能质量的逐项验收由两个适配版门禁 skill 承担（见 §14 与 `frontend/AGENTS.md` 的"质量门禁 Skills"）：

- `.agents/skills/web-design-guidelines/SKILL.md`：生成或评审 UI 时按清单自查（焦点、键盘、loading、动效、表单、token 使用）。
- `.agents/skills/react-best-practices/SKILL.md`：编写或评审 React 代码时自查（瀑布、bundle、重渲染、渲染、JS 性能）。

skill 内容与本文冲突时以本文为准；skill 中的项目映射（token 名、先例文件）更新时必须核对本文对应小节。

## 19. 反面案例与单一入口规范（2026-09-28）

以下四个反面案例来自本次"统一项目上下文"整改（2026-09-28），是**禁止再现**的设计模式。新增界面时先对照本节自查；评审发现同类问题按 §11 例外流程处理，不允许"先上线再改"。

| # | 反面案例 | 为什么是垃圾 | 强制规范 |
|---|---|---|---|
| 1 | 同一概念多入口/多存储：顶栏"项目上下文"选择器与聊天头部"协作项目"下拉并存，各自读写不同服务端事实 | 用户无法判断改哪个生效；两份状态必然漂移，切换后表现不一致 | 每个用户可感知概念只允许**一个**选择控件、一个服务端事实源。项目上下文的唯一入口是顶栏"项目"选择器；新增项目相关入口前必须先证明既有控件不可覆盖 |
| 2 | 原始 ID 直接暴露给用户：后台工作面板显示 `fixedContext` 原始 project id，会话详情头显示原始 `collaborationProjectId` | 内部稳定 ID 不是用户语言；用户无法对应到自己的项目，也泄露内部命名 | 面向用户的任何位置必须显示解析后的名称（项目名/会话名）；无项目时用领域词（"Agent 容器"），解析失败时给出可读回退，绝不裸吐 ID |
| 3 | 信息分类与领域模型不对称：任务面板只有"Background tasks"一组，而领域里实际有任务（tasks）、职责（duties）、后台工作（works）、主题节点四类 | 用户看到的分类少于系统真实能力，产生"功能缺失"错觉；排查问题信息不对症 | 展示分类必须与领域模型对齐（Long Agent 任务类别：任务/职责/后台执行/主题），缺失类别要么补齐要么明确标注范围，不允许静默裁剪 |
| 4 | 窄侧栏高密度堆叠：左侧横向列表塞入过多控件与信息，无分组与层级 | 拥挤导致可点目标过小、扫描成本高，触控不达标 | 侧栏遵循 §4.3 间距与 44px 触控底线；信息按优先级分层，次要信息折叠或下沉到详情，不为"都可见"而堆叠 |

参考模式：**Linear** 的单一列表 + 分组标题（一个对象一个列表入口，分组只是视图）；**GitHub** 的类型徽标 + 状态色（徽标标类别、状态色标运行态，二者不混用）。任务面板（`LongAgentTasksPanel`）按此实现：badge 标 task/duty/exec/work 类别，状态列标 accepted/running/failed 等运行态。

选择控件唯一入口原则：任何"选择 X"的操作在整个产品中只有一个持久控件；临时上下文变化通过该控件的联动表达，不新增平行控件。Vercel 门禁 skill（§18.5）已在 `frontend/.agents/skills/`，生成与评审 UI 时按其清单自查本节。

## 20. 组件复用与抽象门槛（2026-09-29）

目的：新页面组合既有原语，而不是复制一套按钮、浮层、表单或日期导航。本节是 §11.2「不重复模式应收敛」的可执行版本。

### 20.1 唯一原语

| 需求 | 唯一原语 | 位置 |
|---|---|---|
| 动作按钮 | `Button`（primary/secondary/ghost/danger，`data-ui-button`） | `components/ui/Button.tsx` |
| 页面标题与返回 | `PageHeader` | `components/ui/PageHeader.tsx` |
| 模态浮层 | `SurfaceDialog`（Radix Dialog，宽/窄两档） | `components/SurfaceDialog.tsx` |
| 破坏性确认 | `ConfirmationProvider` + `useConfirmation`（Radix AlertDialog） | `components/ui/Confirmation.tsx` |
| 锚定提示 | `Hint`（Radix Tooltip） | `components/ui/Tooltip.tsx` |
| 锚定浮层 / 菜单 | `Popover` / `DropdownMenu` | `components/ui/` |
| 非阻断反馈 | sonner（`FeedbackToaster`） | `components/ui/FeedbackToaster.tsx` |
| 导航快捷入口 | `CommandPalette`（⌘K） | `components/ui/CommandPalette.tsx` |
| 代码高亮 | `SourceCode`（Shiki，唯一入口） | `components/ui/SourceCode.tsx` |
| 开关 / 选择 | `ConfigurationToggle` / `SearchSelect` | `components/` |

- `data-ui-button` 只能由 `components/ui/Button.tsx` 与其 `ui.module.css` 声明；页面不得自造按钮本体样式，也不得复制 `SurfaceDialog` 的焦点/Escape/关闭实现。
- 新配置或编辑界面一律使用 `SurfaceDialog`。`role="dialog"` 的手写浮层只允许出现在 `lib/motion-contract.test.mjs` 记录的迁移清单里；向该清单新增一项，等于显式承认新增了一处分歧，必须在评审中说明理由和收敛计划。

### 20.2 何时才抽象

- 至少两个真实消费者，且合同稳定；「看起来相似」不算消费者。
- 抽象产物放到职责最窄的位置：纯逻辑进 `lib/`、状态编排进 `hooks/`、视觉原语进 `components/ui/`。
- 一次性或单页面需求先局部实现，不先造通用组件。不为抽象而抽象。

### 20.3 何时必须收敛

- 同一交互出现第三种实现方式（§18.4 判定方法）。
- 同一硬编码值第三次出现，或同一布局数值在多个文件各写一遍。
- 同一动作在两个入口产生不同的结果、反馈或恢复路径。

### 20.4 共享布局类

资源对话框（Models / Skills / Plugins / Extensions / Provider requests）的重复排版收敛为 `src/styles/components.css` 的 `ui-*` 布局类（`ui-stack-*`、`ui-row-*`、`ui-grow`、`ui-list-scroll`、`ui-dim*`、`ui-muted*`、`ui-note`、`ui-scrim*` 等）：**布局进类、语义进组件**。新增一个值要在这里命名，而不是再写一个 inline `style={{…}}`。`ui-scrim`/`ui-scrim-center` 同时承担这些对话框遮罩的淡入（§8.2），不允许再写 `rgba(0,0,0,…)`。

### 20.5 工具栏动作

- 工具栏动作（顶栏、面板头、会话工具栏）与**全局主导航 rail、分支动作**统一**默认仅图标**，尺寸 36px（粗指针 44px），共享 `.toolbar-action` 类与 `components/ui/ToolbarAction.tsx`。
- 设置 → 外观 → “工具栏操作”可切换“仅图标 / 图标与文字”（`chat:toolbar-labels`，默认仅图标）。开启后**所有**工具栏动作一起显示文字，不允许有的带文字、有的只有图标。
- 图标按钮保留 `aria-label` 与 `Hint`；文字只是同一名称的可视化，不引入第二个术语。
- **两个位置，一个原语**：`shape="bar"` 用于顶栏条带（带分隔线、整高）；`shape="frame"` 用于输入框框内的动作（圆角 32px、Compact 44px、无分隔线）。计数徽标用 `badge`，不另做角标实现。
- **职责分工**：会话级动作（任务与归档、会话记忆+计数、压缩、声音、推送通知、视图宽度）在**顶栏**，通过 `workspace-chat-actions-slot` 由会话组件 portal 进去；本轮输入级动作（附件、Workflow 选择、Workflow Agents、发送/停止）留在**输入框框内**。二者都不得自建按钮样式。
- **框内的值控件**：选择当前值（如 Workflow）用 `composer-control` 触发 + 共享 `DropdownMenu`（`ui-menu`/`ui-menu-item`/`ui-menu-indicator` 单选标记）；**禁止原生 `<select>`** 与自绘下拉列表。
- **框内布局**：输入框是**一个** `.composer-frame`（持边框/背景/圆角/阴影），内部只有**一行**：textarea 与输入级控件同排（附件、Agents、发送/停止、Workflow），不再有「输入框下面那一排」；Workflow 值控件位于**发送按钮右侧**。焦点/流式/排队等状态用 `is-bash`/`is-queued` 之类的状态类表达；Compact 允许该行换行。
- **值控件显示图标 + 当前值**：Workflow 选择器的触发点是图标 + Workflow 名称（不是纯图标、也不是原生 select），浮层用共享单选菜单。
- **状态来自类与 Token**：禁止用 `onMouseEnter/onMouseLeave` 直接改 DOM 样式（历史上 composer 那一排就是这样与工具栏分叉的）；hover/pressed/active 必须是 CSS 类 + 语义 Token。
- **Compact 例外**：触控没有 hover，底部主导航保留可见名称，仅视觉隐藏标签的既有短横屏规则不变（§7 可发现性优先）。
- 规范语义见 §15：主导航仍占 64px 栏宽，图标居中；开启文字后恢复图标在上、名称在下的形态。

### 20.6 浮层：一套尺寸、一套动效、一套层级

所有浮层（模态、锚点菜单、气泡、底部 sheet）必须共享同一套语言，禁止每个浮层各写一份：

- **组件**：临时配置/阅读类一律 `SurfaceDialog`（Radix，负责遮罩、焦点、Escape、安全区、动效与层级）；锚点浮层一律 `Popover`/`DropdownMenu`（`ui-popover`/`ui-menu`）；移动端底部 sheet 只允许改**位置**，表面与动效仍取共享样式。组件内不得再出现手写 `role="dialog"`（`lib/motion-contract.test.mjs` 维护已评审的迁移清单，新增即失败）。
- **尺寸**：三档，用同一个公式（`min(<档位>, <视口 − 48px>)`），只换数字：`regular` 常规 `960×800`，`wide` 宽屏阅读 `1440×1000`，`full` 最大化（`100vw×100dvh`，无边框圆角，用于 Provider 请求等需要满屏的工作台）；Compact 一律全屏。`size` 是显式档位（不是布尔），高度规则不许各写各的。
- **动效**：同一个 modal 家族用 `scrim-in`（遮罩淡入）+ `layer-in`（内容浮现），关闭用 `scrim-out`/`layer-out`；锚点浮层用 `ui-float-in`。禁止私人 `@keyframes`（命令面板曾是唯一例外，已并入 `layer-in`）。一次性揭示与循环指示器仍按 §8.1 白名单。
- **层级**：只允许使用层级 Token —— `--layer-sheet: 240` < `--layer-modal: 1101` < `--layer-float: 1250` < `--layer-tooltip: 1300` < `--layer-toast: 1500`（锚点浮层高于模态，保证对话框内的选择器不会被埋住）。组件内联 `zIndex` 仅允许组件内部堆叠（≤200），覆盖层级别的数字必须迁到 Token（门禁维护已评审清单）。
- **iOS 独立模式**：所有模态的遮罩统一使用 `max(59px, var(--safe-area-top))` 等安全区内边距，不再只对某一种对话框生效。

### 20.6 停靠面板

侧面板（列表侧栏、项目资料、任务与归档区域）共用一个原语 `.workspace-dock`（`src/styles/components.css`）：

- 展开/收起用 **class**（`.is-open` / `.is-closed`）而不是条件渲染，否则没有进出过渡；关闭态宽度 0、无边框，保持挂载但 `inert` + `aria-hidden`。
- 宽度用 `--dock-width`，过渡固定 `--duration-panel` + `--ease-standard`；内层内容固定同宽，避免开合时重排。
- **`--dock-width` 必须是绝对长度**（px/clamp），不能写百分比：原语会把它同时用在面板和内层上，百分比会相对面板二次解析，把内容压成一栏（本轮任务与归档布局错乱就是这个原因）。窄屏用媒体查询换一个绝对值，不要用 `%`。
- 拖动调整宽度时加 `.is-resizing` 关掉过渡。
- Compact 下侧栏/资料/任务区域改为覆盖 + `transform` 过渡，语义与“项目资料”一致。

新增任何侧面板必须复用该原语，不允许再写一套宽度过渡或条件渲染的“瞬现”区域（本轮修的就是任务与归档区域瞬现、与项目资料开合不一致）。

### 20.7 会话宽度

会话列的阅读宽度由顶栏右侧的宽度滑杆控制（`components/ui/MeasureSlider.tsx`）：

- **组件来源**：用既有原语 `@radix-ui/react-slider`（Root/Track/Range/Thumb），不手写轨道。拖拽跟随、点击定位、pointer capture、触控与 `role="slider"` 语义都由原语提供；自造分隔条实现过一版，拖动时圆点不跟随指针，已废弃。面板边缘拖拽仍用 `useResizablePanel`（分隔条与值控件是两类交互，各自唯一）。
- **一个值**：滑杆只改 `--conversation-measure`（写在 chat surface 上）；**会话内的所有阅读面**——消息列、运行状态、输入框、以及正文 `.markdown-body`（含其段落）——都读 `var(--conversation-measure, var(--measure-prose, 42rem))`。任何元素都不得再写自己的宽度上限：消息区与输入框错位是各自硬编码像素宽度造成的，assistant 回复「拉宽后不变」则是 `.markdown-body`（42rem）和 `.markdown-body > p`（800px）两条静态上限造成的（§7 阅读面）。
- **交互**：拖动时圆点与列宽实时跟随指针；`←/→` 12px、`PageUp/PageDown` 120px、`Home/End` 到 30rem/60rem；轨道任意位置按下即定位；`Enter` 或双击恢复自适应。拖动中只在滑杆内部更新值，松手才提交并持久化（避免整页重渲染）。
- **滑杆位置 = 实际宽度**：显示的值与应用的 `--conversation-measure` 永远相同；自动态取「默认 42rem 与可达上限的较小者」，所以窄布局下不会出现「圆点已到最右、内容却还是另一样宽」的错位。显式值优先级高于宽屏内容模式（`data-conversation-measure="manual"` 时覆盖 `.workspace-wide-content` 的 `max-width:100%`），否则打开宽屏模式后滑杆就完全失效。
- **范围**：下限 30rem（480px）；硬上限 90rem（1440px）；**实际可达上限跟随当前会话列**：`conversationMeasureMaxWidth(列宽)` = 列宽 − 68px 栏内边距（16px 侧边距 + 36px ChatMinimap 沟槽）− 48px 余量（两侧各 24px），由 `ResizeObserver` 观察会话列，左右栏开合、窗口缩放都实时更新。所以滑杆能一直拉到“填满但仍留余量”，不会出现拉到头却没变宽。存下的偏好可以大于当前可达值：应用与显示按当前列宽夹取，窗口变大后自动恢复偏好。窄窗口由 `max-width` 自然收窄，不溢出、不挤压左右栏。
- **自适应**：默认自适应（不写像素覆盖、跟随 `--measure-prose` 与窗口）；拖动即进入手动并按设备持久化（`chat:conversation-measure`，`auto` 表示自适应）。不按 Session/Project 存储。
- **样式**：轨道 96×3px、圆角 999px、`--border`；滑块 14px 圆、`--text-muted`，hover 提到 `--text`，拖动中 `--accent`；命中区桌面 36px 高、Compact 44px；无边框无阴影；动效只做颜色，用 `--duration-fast` + `--ease-standard`，拖动期间圆点与填充不带过渡。
- **指针不得变**：滑杆不得改系统指针（不写 `cursor: col-resize`，拖动中也不切换指针）——悬停高亮可以保留，但鼠标样式保持默认；可发现性靠 `Hint` 与 `aria-label`。门禁扫描 `.measure-slider*` 规则，出现 `cursor:` 即失败。
- **可达性**：滑杆 `aria-label` 为「会话宽度」，`aria-valuemin/max/now` 由 Radix 输出；`Hint` 显示读数（`会话宽度 · 48rem`，自适应时后缀「自适应」），拖动中 Tooltip 按 Radix 默认收起、不额外加浮层；键盘可达，焦点环画在滑块上。
- **Compact**：不渲染滑杆（宽度按屏宽），只有桌面/平板入口。

### 20.8 门禁

`lib/motion-contract.test.mjs` 守住：侧面板必须复用 `.workspace-dock`（含 class 开合与固定内宽）、工具栏动作只能由 `ToolbarAction` 声明（页面不得自造带文字的工具栏按钮）；动效时长与缓动必须来自 Token、pressed 不使用 `filter: brightness()`、每个遮罩必须淡入（Radix 还需淡出）、按钮与模态保持唯一原语、手写模态清单不得无声扩张、组件用到的每个 `ui-*` 类必须在样式表中有对应规则（防拼写漂移）。

`lib/measure-contract.test.mjs` 守住会话列只有一个宽度来源、会话正文必须跟随同一变量（不得保留 42rem/800px 静态上限）、滑杆不得改指针（`.measure-slider*` 规则不得出现 `cursor:`）、手动值必须覆盖宽屏内容模式，并限制：`--conversation-measure` 只能由滑杆写入、滑杆必须用 Radix 原语且不得自带拖拽/存储实现、实时值与提交值分别走 `onValueChange`/`onValueCommit`、消息列与输入框必须读同一变量、Compact 必须归零 `--composer-gutter`；`lib/conversation-measure.test.mjs` 覆盖夹取、步进、读数格式与 `auto` 哨兵。
