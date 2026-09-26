# Chat Frontend 开发指南

本文面向 Frontend 贡献者和协助开发的外部 AI，说明浏览器端代码放在哪里、如何开发和验证，以及与 Chat Backend、父仓库的协作边界。视觉和交互要求不在本文重复，见 [Chat Frontend UI/UX 规范](./ui-ux-guidelines.md)。

## 1. 职责边界

Frontend 是 Vite + React 构建的纯浏览器客户端，只通过 Chat Backend 的公开 HTTP API 使用服务端能力。

Frontend 负责：

- 页面、组件、浏览器交互、路由和 PWA 表面；
- 展示 Backend 返回的 Project、Session、Workflow、Agent 和文件状态；
- 管理请求期间的临时 UI 状态，并在刷新、重连或请求完成后用服务端事实校正。

Frontend 不负责：

- 新建服务端路由或直接读写服务端文件系统；
- 运行 Pi SDK、`AgentSession` 或 Workflow；
- 在 React 内存、浏览器存储或构建产物中保存一份独立的服务端事实；
- 在静态文件或 Vite 环境变量中保存 Credential、真实设备目录等私有数据。

### 普通 Workflow 与终端接续

会话输入框上方的 `RunStatus` 独立展示执行阶段、阶段计时与终态；正文出现不会隐藏状态。Pi `turn_start` 表示等待模型，思考/正文/工具、重试、压缩和审核由原生事件驱动。每秒计时仅更新该组件，不驱动消息滚动。30秒无新事件提示尚无进展，已有 Run 轮询提供最近确认时间；这不是模型健康证明。断流与执行失败分别展示，不自动重发 Prompt。

`toolcall_start/delta/end` 属于模型生成工具参数，显示“模型正在生成工具参数”；只有 `tool_execution_start` 才表示工具开始执行。顶部流式 token 估算包含思考、正文和工具参数，t/s 是本次消息的估算平均生成速度，不能用它推断当前执行的是模型还是工具。工具参数持续增长时，顶部 token 与底部生成参数提示应同时更新。

Run 完成后最多等待200ms排空过程流，再读取持久 Session；JSON 请求及 Session 重读设10秒网络超时，不限制模型/工具执行时长。运行已接受后失败保留已发送消息，不自动恢复成待发送草稿。停止按钮等待服务端确认，失败保留提示；Friend 的“停止”调用真实取消；离开页面仅停止观察，详见本文 P4 合同。Session 的可选 `workflowOutcome` 为 `{runId,status:completed|failed|cancelled,error?}`，经 `lib/workflow-outcome.ts` 校验后用于刷新恢复最后一轮结果，不能根据最后一条工具消息猜测完成。

普通 Session 使用 `activeWorkflowRun` 恢复所有 Workflow 的活跃 Run，兼容既有 `activePlanningExecution`。可见且空闲的当前会话每 3 秒重新读取 Backend；保留输入草稿，历史浏览时暂停自动替换。同步失败显示提示并重试，不能自动重发 Prompt。Session 侧栏继续使用自身刷新周期。

Fork 通过 `lib/session-fork-browser.ts` 调用 `POST /api/sessions/:id/fork`，携带 Project、用户 Entry 与稳定 UUID requestId。响应通过运行时校验后切换到新 Session，所选文字存入子 Session 草稿；源会话不修改。正在运行、等待审核或 Long Agent 会话不允许此操作。完整合同见父仓库 `docs/modules/tui/chat-workflow-tui.md`。

### 1.1 当前Long Agent页面基线

首次使用的“Friend”面板不要求已选 Project。空状态通过 `POST /api/long-agents/enable`（空对象）显式创建默认 Nexus；有 Friend 后仍提供“＋”创建。产品中 Long Agent 统一称为 Friend，翻译键和服务实体标识不因此迁移。网关健康只标为“网关已连接/未连接”，不推断 IM 收发可用。新建表单只要求名称和可选简介；内部 ID 由系统自动生成，同一草稿失败重试沿用该 ID，成功后才清空。表单不接收 NanoClaw Group ID、不硬编码实例 ID，`POST /api/long-agents` 由 Backend 完成 Group 与独立空间初始化。两个响应共用运行时 Parser；失败保留草稿、允许原请求重试，成功重读列表，点击 Friend 进入其 home 会话。前端不启动服务、不保存另一份启用状态。

当前工作区提供 Friend、项目、动态、设置四个全局入口。顶部 Project 是选中的交流上下文；切换 Project 更新项目资料，在 Friend 模式保留 Friend 与原 Session。普通 Session 仍归属于 Project；进入项目模式可新建、恢复多个普通 Session，Friend 专属 Session 不重复列入普通列表。布局和数据归属分别负责：页面选择不会改变后端 Session owner 或实际执行目录。

打开普通 Session 使用 Workflow 发送；打开 Friend 使用 turns 接受与实时订阅 API，终态后重读 Pi Session。Friend 列表通过全局 `GET /api/long-agents` 获取身份；点击通过 `POST /api/long-agents/:id/start` 返回的实际 Project/Session 打开，不能以顶部 Project 猜测归属。未实现的长期能力及迁移差距仍以父仓库 Long Agent 架构文档为准，不能从前端布局推断已支持多方会话或跨项目执行。

Session列表与Session详情中的`session.owner`是导航和发送链共用的唯一归属事实。Frontend运行时合同必须接受且严格校验`{ type: "ordinary" }`或`{ type: "long-agent", longAgentId, projectLongAgentId }`，并直接用该值选择面板与发送API。Long Agent列表只用于展示 Friend 和配置/运行状态，不得异步用`primarySessionId`反推Session归属；也不得根据消息内容猜测，或在Hook/组件中维护第二份映射。`owner`缺失、非法或无法解析时必须停止发送并告警/重新加载，不得默认当成Workflow Session继续执行。

全局“Friend”的设置及右侧“Friend 资料 → 管理这位 Friend”打开同一个 Long Agent 配置页，管理的是跨Project持续的Personal `LongAgent`与其一对一映射的NanoClaw Agent Group；`ProjectLongAgent`为当前 Home 日历会话投影，历史归属另由完整日历与迁移记录提供。配置的三个核心标签页来源如下；另外提供任务与活动标签，任务使用 `friend-tasks.ts` 的 schema 2 同源 API，活动读取既有活动/动态 API：

1. “运行策略”编辑Chat Personal配置中的显示别名、列表摘要、全局启停、默认Project、Model、Thinking Level、System Prompt/自定义Prompt、Tools和Resources；这里的别名不是Agent运行身份。
2. “Agent Group”编辑NanoClaw拥有的运行身份名称和Standing Instructions，并只读展示稳定Group ID、Workspace安全摘要、核心Memory快照、revision和stale状态。
3. “Agent Memory”管理该Agent Group自己的OKF Markdown文件，支持列表、搜索、打开、新建、编辑和确认删除。

Agent Group与Agent Memory通过Backend的安全投影进入浏览器。Frontend不得直接读取NanoClaw目录或数据库，也不得接收宿主机绝对路径、Telegram Credential、服务Credential、事件游标、Nano容器Provider或容器运行状态。Workspace与Memory路径只能是拒绝绝对路径、反斜杠、`.`和`..`段的相对路径。所有保存按内容revision做乐观并发保护；`409`必须保留或明确处理页面草稿，不能自动覆盖新版本。Chat运行策略、Agent Group和Agent Memory配置均从下一轮Long Agent对话开始装配，页面不提供含义模糊的Agent进程操作。

需要新增或改变服务端事实时，先共同设计父仓库Backend与浏览器合同，再按依赖实施并一起验证。兼容格式的新资源由后端Catalog驱动通用列表；新字段、枚举或语义可能要求修改严格Parser，不能承诺全部变化自动适配。完整资源变更通知尚待实现；现有Workflow Run通过HTTP NDJSON流消费，Friend 与 Workflow 共用 NDJSON 消费核心；资源变更不因此成为已有的统一 SSE/WebSocket 事件总线。

### 1.2 朋友圈阅读界面

朋友圈是全局阅读页，入口位于全局导航“动态”，对全部 Friend 可用且不依赖已选 Project。`AppShell` 通过 `useWorkspaceView` 管理 `?view=moments`：打开时新增浏览器历史，刷新可恢复，返回按钮/浏览器返回恢复聊天。直接访问该地址也提供返回聊天入口。Session 查询参数继续保留；异步 Session 地址更新不得清除当前阅读页。

动态使用单列阅读区，隐藏项目上下文条和资料面板；Compact 使用底部全局导航。旧 Friend 列表的“圈”按钮及弹窗已移除。切换仅隐藏聊天与文件面板，`ChatWindow` 和文件查看器仍保持挂载，保留草稿、滚动与运行连接；浏览朋友圈时停用聊天全局快捷键，防止 Escape 中止后台 Agent。点击其他会话或新建会话切回聊天。进入朋友圈将焦点置于标题，返回时恢复可见的导航入口或聊天区域。

顶部横向头像栏用于按作者筛选，默认全部 Friend；下方按 Backend 返回顺序展示最新 30 条动态、作者头像/名称、发布时间与评论。筛选仅作用于本次加载内容，不代表某 Friend 的完整历史。头像圈不表示未读或限时 Story；选择作者后回到动态顶部。此处按用户明确的 Instagram 风格要求采用横向作者导航，是社交阅读场景的局部设计，不扩展为普通工具页面模式。

数据复用 `GET /api/long-agents` 与 `GET /api/long-agents/:id/social?limit=30`；后者默认返回全部 Friend。浏览器校验帖子、评论、时间与身份；已不在列表中的作者保留稳定 ID 和自动头像。当前 HTTP 合同只提供文字与评论读取。刷新失败保留已加载内容并提供重试；空列表、筛选为空、无 Friend、加载与失败分别呈现。离开时取消请求。

回归门禁：`lib/long-agent-feed.test.mjs` 检查网络边界、双语文案、全局入口和移动布局；`lib/workspace-view.test.mjs` 检查视图与 Session 地址的组合。浏览器验收覆盖两种主题、作者筛选、评论展开、重试、刷新/前进/后退、聊天草稿与滚动恢复，以及隐藏聊天不处理 Escape。

## 2. 目录职责

| 路径 | 用途 |
|---|---|
| `src/` | 应用入口和全局样式 |
| `components/` | 页面区域和可复用 React 组件 |
| `hooks/` | React 状态编排、生命周期和浏览器能力 |
| `lib/` | HTTP 合同、解析器和不依赖视图的业务逻辑 |
| `lib/i18n/` | 文案注册、格式化和中英文消息 |
| `public/` | Manifest、Service Worker、离线页、图标等静态资源 |
| `docs/` | Frontend 开发和 UI/UX 规范 |

新增代码应放到职责最窄的位置。可脱离 React 测试的解析、归一化和状态转换优先放在 `lib/`；组件不应重复实现同一份 HTTP 合同。

## 3. 本地开发

首次安装并启动开发服务器：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

开发服务器默认监听 `127.0.0.1:30145`。Frontend 依赖 Chat Backend API；涉及完整交互时，应按父仓库说明启动 Backend，而不是在本仓库补一套模拟服务端。

## 4. HTTP 合同

浏览器不能信任网络响应。每个新增或变更的 HTTP 响应都必须在 `lib/` 的合同边界中从 `unknown` 做运行时结构校验，然后再交给 Hook 或组件使用。不要只依赖 TypeScript 类型断言。

一个合同通常包括：

- 请求函数及必要的 URL 参数、Method 和 Credential 策略；
- 成功响应的结构解析与字段校验；
- 非成功状态、非 JSON 响应和缺失字段的明确错误；
- 覆盖正常响应和非法响应的合同测试。

Backend 合同变化时，Frontend 类型、运行时解析和测试必须在同一任务中同步更新。

Long Agent配置使用`GET /api/long-agents/:id/config`和`PUT /api/long-agents/:id/config`。GET响应包含`schemaVersion`、`revision`、可编辑Agent Definition、展示头像投影和只读Channel/Host摘要；PUT提交完整表单与`expectedRevision`。后端用revision做乐观并发控制并原子保存；`409`表示基线已过期，前端应保留用户可见的草稿或告知差异，重新加载服务端事实，不得不带条件重试覆盖。保存成功后必须使用响应中的新revision和正规化配置替换本地基线。

展示头像属于同一身份配置域：`avatar`投影为`{kind:"auto"}`、`{kind:"emoji",emoji}`或`{kind:"image",revision}`；auto/emoji随配置PUT保存，图片只能通过`PUT /api/long-agents/:id/avatar?expectedRevision=…`（raw bytes，PNG/JPEG/WebP不超过2MB）和同名`DELETE`修改，两者返回更新后的完整配置文档以刷新revision基线；图片内容经`GET /api/long-agents/:id/avatar?v=<revision>`读取，revision作缓存键。前端不得请求或拼资产文件路径。

“运行策略”的模型区显示生效模型/生效思考等级与来源（`agent.effective`，`explicit`/`chat-default`），选项来自`/api/models`（只含用户在Chat Home `models.json`配置的模型）；资源区在“明确配置资源路径”模式下，通过`/api/skills`、`/api/extensions`、`/api/plugins`（按Agent默认Project）提供Skills/Extensions/Plugins目录勾选，同时保留手填路径面板。

侧边栏“Friend”面板是社交式联系人列表：每个 Friend 一行，头像（图片/Emoji/ID派生色）、名称、描述与在线状态点；Friend 身份只在该面板展示，输入区不重复显示。

NanoClaw Agent Group与Agent Memory集中由`lib/long-agent-group-browser.ts`封装，组件不得自行拼URL或解析未验证JSON。当前精确合同为：

| 接口 | 请求 | 成功响应 |
|---|---|---|
| `GET /api/long-agents/:id/agent-group` | 无 | `{schemaVersion, stale, fetchedAt, group, workspace, coreMemory}`安全投影 |
| `PATCH /api/long-agents/:id/agent-group` | `{schemaVersion:1, expectedRevision, name, standingInstructions}` | 更新后的Agent Group安全投影 |
| `GET /api/long-agents/:id/agent-memory?operation=list` | 无 | `{schemaVersion, stale, agentGroupId, files}` |
| `GET /api/long-agents/:id/agent-memory?operation=read&path=...` | 安全相对路径 | `{schemaVersion, stale, agentGroupId, file}` |
| `GET /api/long-agents/:id/agent-memory?operation=search&query=...&limit=...` | 非空查询和有界limit | `{schemaVersion, stale, agentGroupId, results}` |
| `PATCH /api/long-agents/:id/agent-memory` | `operation=write`加`path/content/expectedRevision`，或`operation=delete`加`path/expectedRevision` | 写入返回`file`；删除返回`deleted:true`和相对`path` |

所有Group、核心Memory和普通Memory revision都使用`sha256:`加64位小写十六进制摘要。合同解析器拒绝未知字段、非法revision、绝对路径、路径穿越、非法时间、负数size和不完整嵌套对象。新建Memory文件的`expectedRevision`是`null`；修改与删除必须提交当前文件revision。写入或删除成功后，页面重新读取列表以服务端事实校正显示。stale响应可以只读展示，但保存前必须提醒用户刷新确认。

## 5. 状态、并发与错误

- 输入框仅将 `lib/builtin-slash-commands.ts` 中登记的完整命令名交给前端命令处理；菜单与发送校验共用该定义。以 `/Users/...`、`/tmp` 等路径开头的输入，以及未登记的斜杠前缀文字，走普通消息 API，不能按首字符 `/` 拦截。当前会话不支持的已登记命令必须显示可见提示并保留草稿；原有 `!` Shell 快捷入口仍不支持，不因此开放浏览器执行命令。
- Backend 和 Pi Session 是持久事实源；页面组件只拥有输入草稿、选中项、展开状态、加载状态等界面状态。
- 消息滚动由 `ChatWindow` 和 `lib/chat-auto-scroll.ts` 管理：首次载入、新消息、流式增量、工具进度和运行阶段变化均跟随消息区底部；移除发送后固定用户提问位置的占位空间。相同内容的定时读取不算新活动，上翻及历史分页保留阅读位置；下一次真实活动恢复跟随。跟随时通过 `ResizeObserver` 处理延迟布局和输入区/视口尺寸变化，按动画帧合并定位，仅滚动消息容器。回归门禁为 `lib/chat-auto-scroll.test.mjs`。
- 未发送文字使用有版本的 sessionStorage，同标签页刷新恢复、不同窗口独立。键包含设备和所属 Project/Session；Friend 再含上下文 Project；新会话使用稳定 Project 键，未解析时以目录暂存。图片只在内存保留，刷新后显示附件缺失提示，不伪造附件引用。草稿不随导航卸载清除；存储不可用时保留内存内容，不承诺刷新恢复。
- 发送前以同一草稿作用域保留待核实输入（`lib/pending-submission.ts`）。输入框可乐观清空，Workflow 明确接受或 Long Agent 成功响应才清对应记录，不能清掉用户后来写的草稿。确认前刷新显示保留文字并要求用户核对会话，可恢复或清除；未处理时阻止下一次发送，不自动补发，也不按正文去重来推断服务器接受状态。它是浏览器输入恢复，不是另一套投递/执行事实。附件只记录缺失数量。
- 服务端状态变更必须通过 API 完成。刷新、切换 Project、重连和任务完成后，以重新读取的服务端结果校正界面。
- Effect 或搜索请求在参数变化和组件卸载时应取消；不能取消时，使用请求序号等方式丢弃过期响应，避免旧请求覆盖新状态。
- 提交期间应阻止重复操作。乐观更新只用于 Backend 已接受并返回稳定身份的操作，并保留失败恢复路径。
- 错误信息应说明失败对象、可理解原因、数据是否保留和可执行的恢复动作。不得把断网、未知状态和 Agent 运行失败混为一谈。

涉及加载、空状态、长任务、通知、Dialog、响应式或无障碍行为时，完整遵守 [Chat Frontend UI/UX 规范](./ui-ux-guidelines.md)。

## 6. 测试与构建

修改完成后运行：

```bash
pnpm test
pnpm typecheck
pnpm build
```

- `pnpm test`：运行 `lib/*.test.mjs` 和 `public/*.test.mjs` 中的合同、状态逻辑与 PWA 测试。
- `pnpm typecheck`：执行严格 TypeScript 检查。
- `pnpm build`：执行类型检查并生成 Vite 生产构建。

新增 HTTP 合同或纯逻辑时，应补对应的 `*.test.mjs`。修改 Manifest、Service Worker、图标、移动布局或 PWA 行为时，应同步更新相关测试。完整 Chat 执行链的验证在父仓库完成。

## 7. 父仓库与交付

Chat 父仓库以 `frontend/` Git Submodule 固定本仓库的确定 Commit。Frontend 与父仓库是两个独立 Git 历史：

1. 在本仓库完成修改并运行上述验证；
2. 只提交本次任务相关文件，并推送到 Frontend 仓库；
3. 在父仓库更新 `frontend` Submodule Commit；
4. 运行父仓库要求的验证并提交 Submodule 引用更新。

不得通过只修改父仓库中的 Submodule 指针来代替 Frontend 提交，也不得把未提交的 Frontend 工作区当作可部署状态。上游 Pi Web 的来源和同步方式见 [UPSTREAM.md](../UPSTREAM.md)。

## 7.1 会话打开的关键路径与度量

打开一个会话（点 Friend、点会话条目、旧链接恢复）的既有顺序是：**点击反馈 → 解析今天的会话 → 一次会话读取 → 消息绘制 → 输入可用**。这部分必须保持三件事：

- **一次导航只读一次会话正文**。导航拿到的响应由 `frontend/lib/session-preload.ts` 交给**同一次导航的所有读取者共享**（按会话 id 匹配、短 TTL、会话身份变化即失效）。同一次打开可能由默认落点、点击、旧链接等多个触发者发起，单次消费会让第二个读取者重新下载整份会话；同时 `fetchProjectSessionById` 对同一 navigation 做请求合并，重复触发同一已打开会话时直接复用当前状态。不得用列表里的旧 `primarySessionId` 绕过每日会话解析。导航交接仅用于初次加载；轮次结束、重连和后台同步必须重读耐久历史，不能复用打开时的旧正文。复用已打开会话的数据仍须完成视图切换，不能因省略 GET 而停留在主题或设置页。
- **不得重复全量读取**。按精确 id 解析会话时只读目标文件，不做全目录正文扫描；没有子调用时不扫描子调用；同一个会话在同一次导航里不重复解析。
- **无变更不写入**。今天的会话与绑定已经有效时，打开动作不再刷新 `updatedAt`、不重写全局状态。

度量方法（`scripts/session-open-perf.mjs`，需要先 `pnpm build`）：在隔离 CHAT_HOME 里构造「一个小的目标会话 + 多个无关大会话」，用真实浏览器采样，输出点击/启动到消息可见与可输入的中位数/P95、`/api/sessions/*` 的请求次数与字节数，以及被消除的工作量（全目录扫描耗时、单次会话 GET 耗时/字节）。CI 只守住请求次数、无关文件读取次数与正确性，不用毫秒断言。

## 8. 工作区实现入口

对象关系、切换和完整功能入口只在父仓库 [Chat Web 交互说明](../../docs/modules/web/chat-web.md)维护。纯浏览器实现保留以下分工：

| 入口 | 实现职责 |
|---|---|
| `DeviceWorkspaceRoot`、`AppShell` | 直接进入工作区；导航、资料和配置入口编排，不拥有运行事实 |
| `SessionSidebar` | 项目和列表读取，通过 Portal 复用同一个项目选择器和文件浏览器 |
| `useLongAgentPresence` | 可见列表读取状态；3 秒轮询，隐藏/失败/5 秒超时转未知 |
| `useAgentSession` | 公共事件/消息核心；Workflow 与 Friend 生命周期薄适配，完成重读与恢复 |
| `draft-store`、`pending-submission` | 本窗口未发送/待核实输入；规则见 §5，不保存服务端事实 |
| `device-workspace`、`workspace-memory` | 有效最近位置、文件来源与预览偏好；明确链接优先 |
| `panel-layout`、`useResizablePanel` | 用户调宽偏好与临时空间钳制分离，双击/键盘复位 |
| `ChatMinimap` | 交流区右缘独立 36px 节点条；有用户消息即显示，Compact 隐藏 |
| `TurnSummary`、`turn-summary` | 当前可见轮次累计用量、工具次数、记录用时与展开过程 |
| `useDialogFocus` | 非原生模态键盘/焦点归属；原生 dialog 由浏览器处理 |
| `ConfigurationToggle` | 技能、插件、扩展共用开关，点击区域与视觉轨道分离 |

Session 和 context 响应增加可选 `context.entryTimes`，与 messages/entryIds 一一对齐，值为 Pi Entry 入库 Unix 毫秒或 null；旧服务不返回时允许无耗时展示。`parseEntryTimes` 检查长度和有限非负数。它是消息记录的时间，不是模型消息中的请求开始 timestamp。轮次只按当前可见分支/压缩后的消息统计，不声称是整个 Session 的全部开销。

正常完成进入回复末尾的统一摘要栏，原始用量只在展开过程时按消息查看；活跃阶段、错误、取消、停止等待与未知仍由 `RunStatus` 表达。工具结果、复制、文件产物与聊天节点继续可访问。不可依据最后一条工具成功推断整轮已完成。

### 页面适配入口

全量页面归属表见父仓库 `docs/modules/web/chat-web.md` §4.1。顶栏由 `AppShell` 直接拥有：Project Portal、会话标题与操作在同一 Header，ChatWindow 保持原挂载；全局页隐藏这个 Header。设置分类只改变显示，不新增配置源。

`SurfaceDialog` 为 Tools 与完整历史复用原生 Dialog 生命周期。`history-document` 只对 Backend 返回的 Pi HTML 增加阅读样式，校验 Session data 标记；HTTP 失败、非 HTML、无效 HTML 和超时都可重试。iframe 保留 `allow-downloads allow-scripts`，不放开 same-origin。主题映射来自 Chat 当前 CSS Token，Pi Session 数据与分支脚本不替换。

目录类诊断与选中资源分离；可用条目仍可浏览。Tools 中的使用关系以 Project 配置覆盖 Workflow 默认，不并列伪造冲突状态。工具实际装配仍由 Backend 检查。首次自动打开 Friend 的异步响应在用户已操作列表后失效，不能覆盖用户选择。

Friend 简介在创建和编辑均可为空。配置响应的 `agent.description` 保留空串，`definition.description` 按 Backend 既有合同使用 `Chat Long Agent` 占位；不得把这个占位显示成用户简介。`responseTemplate` 为 null 时使用默认，字符串最长 2000；保存返回 revision 必须与重读一致。相关读取/保存/重置回归位于 Long Agent 前后端合同测试。

## Friend 本轮上下文（P2）

浏览项目、Friend 身份、Session 存储归属是不同状态。发送 Friend 消息时始终提交 `contextProjectId: selectedProjectId ?? null`；null 不等于“沿用上一个项目”。Backend 为该轮冻结规则与工具 cwd/Memory 目标；切换页面项目不应改写正在执行的请求。Friend inspection 的 projectId 为预览的协作项目，缺省为无项目，不是 Session 存储 Project。

Workflow Call parent/child 的可选 projectId 由响应解析器保留，不能用当前页面项目覆盖历史归属。原有旧响应仍兼容。P4 已复用同一聊天组件与实时消费核心，入口生命周期分别接 Workflow Run 和 Friend Turn。

## Friend 每日日历（P3）

运行策略的 timeZone 随原有 revision 保护配置保存；消息使用 pending-submission 的稳定 requestId。`FriendDailyStatus` 在日常记录中显示服务端日历与请求状态，`friend-daily-browser` 校验日期、状态、序号、错误与 Friend 身份。5 秒可见性轮询和显式刷新仅校正显示，不重发消息；切换目标取消观察，旧响应按序号丢弃。总结失败可重试，queued 可取消；失败请求能否重试由 Backend 判断，interrupted 不提供自动重放。

沿用设置字体、语义色与控件；日期、链接和按钮保持整体换行，Compact 操作至少 44px。查看记录只导航原 Session。这个管理状态面用于日历和排队请求；P4 聊天流与之共享耐久队列。离开页面仅断开观察，“停止”调用真实执行取消。后台合同见父仓库 Long Agent 架构 §4.2.1。


## 公共实时聊天（P4）

`execution-stream.ts` 负责两个入口的 NDJSON 传输；`friend-execution.ts` 校验 Friend 引用、快照、事件和能力，并实现接受、订阅、重连和控制。`useAgentSession` 的同一 handleRunEvent/streamReducer/runActivity/MessageView 处理内容，Workflow stage 可选，不给 Friend 构造假身份。精确 HTTP 与操作差异见父仓库[模块合同](../../docs/architecture/chat-module-contracts.md#friend-p4-实时与控制合同)。

Friend 发送只等耐久 202 后清理待确认输入，随后按引用观察；刷新和断网只重取状态，不重发正文。重连先替换快照，再接增量，过期/断序重新同步；15 秒无任何流数据重连。终态来自 Backend，最后重读 Pi 历史。切页只 abort 浏览器订阅；点击停止才 DELETE 执行。当前轮冻结项目不随选择器变化，后续消息按新选项目接受。

引导/后续按钮按实际能力显示；Workflow 未提供追加合同，不显示之前会报不支持的操作，草稿仍可编辑。Friend 跨项目只允许后续消息；接受提示不冒充模型已消费。附件能力取后端有效模型，读取失败明确提示而不是假定图片可用。自动重试/压缩与工具使用共用状态栏，最终用量沿用原生记录统计。原生压缩/分支摘要由 Backend 转成既有 custom 展示合同，快照与普通历史都显示同一摘要组件；不能把原生角色直接强制转换为 AgentMessage。`friend-execution.test.mjs` 验证重复、断序、归属、未知版本、终态及无响应/断开恢复，真实浏览器证据在父仓库 P4 审计中。

## 主题会话

主题节点通过 `useAgentSession` / `ChatWindow` 的 `topicNode` 目标适配使用完整公共聊天。读取走 `/api/sessions/:id`；发送走节点授权入口；观察、工具过程、图片能力、停止和运行中恢复复用 `friend-execution`。新建空节点也从图解析的 `topicNode.longAgentId` 获取身份，不能先露出普通 Workflow 选择器。节点记忆阶段通过同一事件流/快照的可选 `roundPhase` 展示“答案已生成，正在整理会话记忆”；停止作用于当前真实阶段。

`LongAgentTopicsView/Panel` 只负责导航和辅助操作。桌面左侧列出主题与节点关系，中央保留完整高度的会话；窄屏按需打开导航，来源、记忆、开关、锚点和补充整合使用共享 `SurfaceDialog`，不挤占输入区。图/记忆响应由 `lib/topics-browser.ts` 从 unknown 校验。导航选中项可存 localStorage；深链 `?view=topics&topicAgent=…&topicId=…&nodeId=…` 优先，切换后同步地址，数据从 Backend 重读。

日常聊天的 `topic_manage.request_topic`、新建与分叉均到同一审核 Workflow。`TopicCreationRequests` 在日常聊天按来源 Session 查询、在主题导航按 Friend 查询 `GET /api/long-agents/:id/topics/creations`，恢复既有 Run/审核/产物；不重新 POST。创建身份保存在 Backend 原有 Run binding，审核和执行状态仍归 Workflow。组件复用 `PlanReviewCard` 与现有 review/cancel API，可反复修改、批准当前版或取消；刷新/断线保留原执行引用，失败保留已读内容。日常聊天创建完成后提供“进入会话”，面板内批准后打开产物。

会话记忆按 purpose 分组，编辑内容与分类通过 supersede + revision CAS；冲突保留草稿。补充整合单独读取所选父节点的锚点，经用户确认提交；relay 的接受与执行状态分开显示。辅助读取失败不能清空聊天历史。

验证入口为 `lib/topics-browser.test.mjs`、`lib/topic-creation.test.mjs`、`lib/topic-node-execution.test.mjs` 和父仓库 `scripts/topics-browser.test.mjs`。浏览器场景覆盖日常发起、两次修订、审核刷新/断线/批准/取消、创建后进入会话、节点发送/工具/停止、运行中重连、记忆 CAS、补充整合、锚点分叉与视口/缩放。精确运行结果见父仓库[纠偏方案](../../docs/development/topic-mode-correction-plan.md)与收口报告。

## 旧链接与历史（P5）

初始导航和设备快照保留可选 sessionProjectId，对应 URL 的 projectId，区别于浏览器选择的协作项目。携带 Project 的旧链接直接读取精确 Session API，并严格校验返回的 owner、readOnly 与 Session ID；迁移位置由 Backend 决定。未知链接显示失败，不改选其他项目。历史 Friend 由公共 ChatWindow 显示只读说明，点击 Friend 进入今天，不让历史落入普通 Workflow 发送链。

## Friend 后台工作（LA1）

`FriendWorkPanel` 是侧栏工作入口，`lib/friend-work.ts` 严格校验 HTTP v1 绑定及执行归属；身份、Session、workId、固定项目必须一致。列表每 3 秒刷新，隐藏页面不轮询，卸载取消读请求。创建的未确认请求由 `friend-work-draft.ts` 保存到本标签页 sessionStorage，显式重试沿用原 ID 和原项目；实际工作状态从 Backend 恢复。

工作会话继续使用 `useAgentSession` 和 `friend-execution.ts`，没有单独聊天渲染器。FriendExecution.workId 表示固定项目工作，后续消息/引导使用执行记录的 contextProjectId，不跟随顶部项目选择；日常交流仍按下一条消息选择项目。列表提供停止单个执行、打开原生 Session、返回今日主聊。新增文案同时覆盖中英文；回归为 `lib/friend-work.test.mjs`，浏览器还须验证流式、刷新、跨项目及移动布局。

LA2 任务页区分定义修订、调度应用状态和执行历史；不在浏览器计算 cron。create/run 未确认请求在 sessionStorage 保留同一 ID，重试沿用原命令；事实刷新仍来自 Backend。每次执行链接到 LA1 原生工作会话，继续使用公共实时聊天组件。

Friend 项目关联的异步状态按所选 Friend 管理：切换时同时清理旧关联、错误和忙碌标志；旧读取/保存响应按请求代次失效，不得重新污染新 Friend。真实浏览器门禁覆盖慢 GET 快切和挂起 PUT 后切换，后者必须验证新 Friend 的控件仍可操作。
