# Chat Frontend 开发指南

原生会话维护使用 `lib/session-maintenance.ts` 严格解析与 `useSessionMaintenance` 观察后端：按钮、`/compact [说明]`、`/session`、统计、取消和历史继续共用 [Backend 合同](../../docs/modules/sessions/chat-session-maintenance.md)。页面卸载只 detach；运行回执来自服务端，重复 POST 保留 requestId。历史浏览禁发，显式继续成功后才回填编辑内容；不能把只读 leaf 当写入位置。

本文面向 Frontend 贡献者和协助开发的外部 AI，说明浏览器端代码放在哪里、如何开发和验证，以及与 Chat Backend、父仓库的协作边界。视觉和交互要求不在本文重复，见 [Chat Frontend UI/UX 规范](./ui-ux-guidelines.md)。

## 1. 职责边界

本仓库既作为 Chat workspace 子模块构建，也由独立 CI 安装。依赖变更必须同步自身 `pnpm-lock.yaml` 和父仓库 workspace 锁文件；父仓库安装成功不能代替独立 `pnpm install --frozen-lockfile`。在 Chat workspace 内刷新独立锁文件时使用独立临时目录复制 package/lock，避免修改正在运行的 workspace node_modules。

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

首次使用的“Friend”面板不要求已选 Project。空状态通过 `POST /api/long-agents/enable`（空对象）显式创建默认 Nexus。v2.3 起面板不再提供“＋”创建表单：新增长期助手只通过对话让某位长期助手创建（同源 `long_agent_manage` Tool 与 `POST /api/long-agents`），前端不再收集名称/简介，避免出现第二条创建入口。产品中 Long Agent 英语称为 Friend，中文称为“长期助手”，翻译键和服务实体标识不因此迁移。网关健康只标为“网关已连接/未连接”，不推断 IM 收发可用。创建由 Backend 的 `POST /api/long-agents` 完成 Group 与独立空间初始化；前端不接收 NanoClaw Group ID、不硬编码实例 ID、不保存另一份启用状态。启用响应共用运行时 Parser；失败保留错误并允许重试，成功重读列表，点击 Friend 进入其 home 会话。面板头部健康状态是语义圆点 + `Hint`（完整句子放不进 224px 侧栏，不能用省略号冒充状态）。

当前工作区提供 Friend、项目、动态、群聊、主题、设置六个全局入口。顶部 Project 是选中的交流上下文；切换 Project 更新项目资料，在 Friend 模式保留 Friend 与原 Session。普通 Session 仍归属于 Project；进入项目模式可新建、恢复多个普通 Session，Friend 专属 Session 不重复列入普通列表。布局和数据归属分别负责：页面选择不会改变后端 Session owner 或实际执行目录。

普通 Session 使用 `/runs`；Friend/Topic 使用授权接受入口，随后新轮次订阅同一个 Workflow Run，旧接受记录保持兼容订阅；终态后重读 Pi Session。Friend 列表通过全局 `GET /api/long-agents` 获取身份；点击通过 `POST /api/long-agents/:id/start` 返回的实际 Project/Session 打开，不能以顶部 Project 猜测归属。未实现的长期能力及迁移差距仍以父仓库 Long Agent 架构文档为准，不能从前端布局推断已支持多方会话或跨项目执行。

Session列表与Session详情中的`session.owner`是导航和发送链共用的唯一归属事实。Frontend运行时合同必须接受且严格校验`{ type: "ordinary" }`或`{ type: "long-agent", longAgentId, projectLongAgentId }`，并直接用该值选择面板与发送API。Long Agent列表只用于展示 Friend 和配置/运行状态，不得异步用`primarySessionId`反推Session归属；也不得根据消息内容猜测，或在Hook/组件中维护第二份映射。`owner`缺失、非法或无法解析时必须停止发送并告警/重新加载，不得默认当成Workflow Session继续执行。

全局“Friend”的设置及右侧“Friend 资料 → 管理这位 Friend”打开同一个 Long Agent 配置页，管理的是跨Project持续的Personal `LongAgent`与其一对一映射的NanoClaw Agent Group；`ProjectLongAgent`为当前 Home 日历会话投影，历史归属另由完整日历与迁移记录提供。配置共四个栏目：助手设置、长期任务、定时任务、助手记忆。朋友圈、群聊、主题使用全局入口，任务成果位于对应任务详情；内部 Duty、Artifact、Agent Group 不成为额外顶层栏目。定时任务使用 `friend-tasks.ts` 的 schema 2 同源 API，助手设置合并展示下列两种来源但分别保存：

1. “助手设置”的运行配置编辑Chat Personal配置中的显示别名、列表摘要、全局启停、默认Project、Model、Thinking Level、System Prompt/自定义Prompt、Tools和Resources；这里的别名不是Agent运行身份。
2. 同页的身份与长期指令编辑NanoClaw拥有的运行身份名称和Standing Instructions，并只读展示稳定Group ID、Workspace安全摘要、核心Memory快照、revision和stale状态。
3. “助手记忆”管理该Agent Group自己的OKF Markdown文件，支持列表、搜索、打开、新建、编辑和确认删除。

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
| `components/models/` | Models 设置页的独立模块（`ProviderIcon`、`ProviderPicker`、共享 provider 合同）；页面本体只保留目录树与详情编排 |
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

Pi 会话能力的整体兼容账本见父仓库 `docs/modules/pi/chat-pi-session-capabilities.md`。`compaction_end` 的可选 result 保留原生 tokensBefore/estimatedTokensAfter，后者仅为估计；解析器拒绝负数、非有限值和非法错误字段。RunStatus 分开呈现成功、取消和失败，Workflow 仍拥有运行终态。不要把 hook 中的 null/空函数当作已支持的 Pi 能力。

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
- 消息滚动由 `ChatWindow` 和 `lib/chat-auto-scroll.ts` 管理：首次载入、新消息、流式增量、工具进度和运行阶段变化均跟随消息区底部；移除发送后固定用户提问位置的占位空间。相同内容的定时读取不算新活动，上翻及历史分页保留阅读位置；主动展开/收起过程、Thinking、工具或日终总结时暂停布局跟随，保留阅读位置；下一次真实活动恢复跟随。跟随时通过 `ResizeObserver` 处理延迟布局和输入区/视口尺寸变化，按动画帧合并定位，仅滚动消息容器。回归门禁为 `lib/chat-auto-scroll.test.mjs`。
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

性能流程与数字见父仓库[会话导航性能](../../docs/development/session-navigation-performance.md)。已交接/缓存的数据在 layout effect 内同步校验并呈现，避免 keyed ChatWindow 首帧 loading 闪烁；保留 key 的目标隔离。首次滚动在 layout effect 同步定位，后续增量继续按帧合并。打开联系人不把整列 disabled 变灰；保留重复点击保护和 aria-busy，超过 300ms 才显示等待文案。后台重新校验不切换整页 loading。

打开 Friend 仍先通过 Backend 解析今天的会话，不用旧 primarySessionId 推断。Project、Friend、Topic 都用公共聊天控件；Friend/Topic 的下一轮 Workflow 选择发给各自授权接受入口，随后订阅同一 Workflow Run，详情读取仍是公共 Session API。

- `session-view-cache.ts` 保存最多 16 项、8MiB、5 分钟的最近视图，键为 projectId + sessionId。命中先绘制，再执行权威 GET；未命中等待一次合并 GET。同导航所有消费者共享结果，单个观察者取消不取消其他读者，导航不取消服务端执行。失败、身份不匹配、过期或删除清除视图；不能作为授权或 CAS 事实。
- 详情用 `view=chat&deferThinking=1&deferMedia=1`，当前消息不截断，只移除重复的完整树正文；按需全文/媒体读取保留。轮次完成/恢复强制重读。
- 侧边栏一个 `/api/sessions/overview` 请求取 Project 与列表，校验响应后更新；ETag/304 避免无变化下载与 React 重绘。后端仍读取当前 owner 与文件版本，不是延长 TTL 掩盖变更。
- 后端精确 id 查找与原生摘要缓存消除无关文件重复解析；外部 Pi 追加、重命名、移除必须可见。

`scripts/unified-session-perf.mjs <隔离地址> 50` 使用真实浏览器、不拦截响应；校验目标 sessionId、消息数、可见输入框与两帧绘制，分开报告首次、暖态与轮询碰撞。数据为隔离真实副本时只保存数字，不记录消息内容。CI 守住功能、次数和字节机制，不用依赖机器负载的毫秒硬断言。`session-open-perf.mjs` 是此前小夹具基线，不能代替真实规模结果。

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

`lib/session-activity` 在 Session/Topic 历史 HTTP 边界校验可选 `chatSessionActivity`，合同见父仓库模块合同。日终总结/草稿独立显示，不纳入上一用户轮次的最终答案、用量或记录用时。已明确归属的 `{did, reflections, handoff}` 按段展示并保留原始 JSON；格式不匹配时显示原文，不猜测、不丢弃。记忆 writer 回执仍属于对应工作轮次，显示为“会话记忆整理”。`turnProcessIndices` 保持过程原始顺序，不能把最终回答中的 Thinking 排到记忆回执之后。

历史 Thinking 和工具不使用相邻消息 timestamp 推算耗时；流式 Thinking 的秒数仅表示页面观察时间。真实空 Thinking 不生成折叠框，延迟正文保留加载入口并采用有界请求，缺失或失败给出明确状态；短文本如 `Now respond.` 原样保留，不擅自删除。

### 页面适配入口

全量页面归属表见父仓库 `docs/modules/web/chat-web.md` §4.1。顶栏由 `AppShell` 直接拥有：Project Portal、会话标题与操作在同一 Header，ChatWindow 保持原挂载；全局页隐藏这个 Header。设置分类只改变显示，不新增配置源。

`SurfaceDialog` 为 Tools 与完整历史复用原生 Dialog 生命周期。`history-document` 只对 Backend 返回的 Pi HTML 增加阅读样式，校验 Session data 标记；HTTP 失败、非 HTML、无效 HTML 和超时都可重试。iframe 保留 `allow-downloads allow-scripts`，不放开 same-origin。主题映射来自 Chat 当前 CSS Token，Pi Session 数据与分支脚本不替换。

完整历史的请求成功必须通过 React state 触发文档合成及首帧呈现；不能只修改 ref 等待无关重渲染。缓存按 Project/Session 隔离，切换及卸载取消旧请求，文档随组件释放；稳定的 srcDoc 仅在内容、主题或语言变化时更新，兼容不支持 sandbox Blob 导航的内嵌浏览器。首次点击后不切标签、不改主题就应出现 iframe，门禁覆盖 `prompt-capture-browser` 与 `group-browser`。

目录类诊断与选中资源分离；可用条目仍可浏览。Tools 中的使用关系以 Project 配置覆盖 Workflow 默认，不并列伪造冲突状态。工具实际装配仍由 Backend 检查。首次自动打开 Friend 的异步响应在用户已操作列表后失效，不能覆盖用户选择。

Friend 简介在创建和编辑均可为空。配置响应的 `agent.description` 保留空串，`definition.description` 按 Backend 既有合同使用 `Chat Long Agent` 占位；不得把这个占位显示成用户简介。`responseTemplate` 为 null 时使用默认，字符串最长 2000；保存返回 revision 必须与重读一致。相关读取/保存/重置回归位于 Long Agent 前后端合同测试。

## Friend 本轮上下文（P2）

浏览项目、Friend 身份、Session 存储归属是不同状态。发送 Friend 消息时始终提交 `contextProjectId: selectedProjectId ?? null`；null 不等于“沿用上一个项目”。Backend 为该轮冻结规则与工具 cwd/Memory 目标；切换页面项目不应改写正在执行的请求。Friend inspection 的 projectId 为预览的本轮项目，缺省为无项目，不是 Session 存储 Project。

Workflow Call parent/child 的可选 projectId 由响应解析器保留，不能用当前页面项目覆盖历史归属。原有旧响应仍兼容。P4 已复用同一聊天组件与实时消费核心，入口生命周期分别接 Workflow Run 和 Friend Turn。

## Friend 每日日历（P3）

运行策略的 timeZone 随原有 revision 保护配置保存；消息使用 pending-submission 的稳定 requestId。`FriendDailyStatus` 在日常记录中显示服务端日历与请求状态，`friend-daily-browser` 校验日期、状态、序号、错误与 Friend 身份。5 秒可见性轮询和显式刷新仅校正显示，不重发消息；切换目标取消观察，旧响应按序号丢弃。总结失败可重试，queued 可取消；失败请求能否重试由 Backend 判断，interrupted 不提供自动重放。

沿用设置字体、语义色与控件；日期、链接和按钮保持整体换行，Compact 操作至少 44px。查看记录只导航原 Session。这个管理状态面用于日历和排队请求；P4 聊天流与之共享耐久队列。离开页面仅断开观察，“停止”调用真实执行取消。后台合同见父仓库 Long Agent 架构 §4.2.1。


## 公共实时聊天（P4）

`execution-stream.ts` 负责两个入口的 NDJSON 传输；`friend-execution.ts` 校验 Friend 引用、快照、事件和能力，并实现接受、订阅、重连和控制。`useAgentSession` 的同一 handleRunEvent/streamReducer/runActivity/MessageView 处理内容，Workflow stage 可选，不给 Friend 构造假身份。精确 HTTP 与操作差异见父仓库[模块合同](../../docs/architecture/chat-module-contracts.md#friend-p4-实时与控制合同)。

Friend 发送只等耐久 202 后清理待确认输入，随后按引用观察；刷新和断网只重取状态，不重发正文。重连先替换快照，再接增量，过期/断序重新同步；15 秒无任何流数据重连。终态来自 Backend，最后重读 Pi 历史。切页只 abort 浏览器订阅；点击停止才 DELETE 执行。当前轮冻结项目不随选择器变化，后续消息按新选项目接受。

引导/后续按钮按实际能力显示；Workflow 未提供追加合同，不显示之前会报不支持的操作，草稿仍可编辑。Friend 跨项目只允许后续消息；接受提示不冒充模型已消费。附件能力取后端有效模型，读取失败明确提示而不是假定图片可用。自动重试/压缩与工具使用共用状态栏，最终用量沿用原生记录统计。原生压缩/分支摘要由 Backend 转成既有 custom 展示合同，快照与普通历史都显示同一摘要组件；不能把原生角色直接强制转换为 AgentMessage。`friend-execution.test.mjs` 验证重复、断序、归属、未知版本、终态及无响应/断开恢复，真实浏览器证据在父仓库 P4 审计中。

## 主题会话

主题节点通过 `useAgentSession` / `ChatWindow` 的 `topicNode` 目标适配使用完整公共聊天。读取走 `/api/sessions/:id`；发送走节点授权入口；观察、工具过程、图片能力、停止和运行中恢复复用 `friend-execution`。新建空节点也从图解析的 `topicNode.longAgentId` 获取身份；允许选择 Workflow，但发送始终保留节点授权归属，不能暂时走普通 `/runs`。节点记忆阶段通过同一事件流/快照的可选 `roundPhase` 展示“答案已生成，正在整理会话记忆”；停止作用于当前真实阶段。

`LongAgentTopicsView/Panel` 只负责导航和辅助操作。桌面左侧列出主题与节点关系，中央保留完整高度的会话；窄屏按需打开导航，来源、记忆、开关、锚点和补充整合使用共享 `SurfaceDialog`，不挤占输入区。图/记忆响应由 `lib/topics-browser.ts` 从 unknown 校验。导航选中项可存 localStorage；深链 `?view=topics&topicAgent=…&topicId=…&nodeId=…` 优先，切换后同步地址，数据从 Backend 重读。

日常聊天的 `topic_manage.request_topic`、新建与分叉均到同一审核 Workflow。`TopicCreationRequests` 在日常聊天按来源 Session 查询、在主题导航按 Friend 查询 `GET /api/long-agents/:id/topics/creations`，恢复既有 Run/审核/产物；不重新 POST。创建身份保存在 Backend 原有 Run binding，审核和执行状态仍归 Workflow。组件复用 `PlanReviewCard` 与现有 review/cancel API，可反复修改、批准当前版或取消；刷新/断线保留原执行引用，失败保留已读内容。日常聊天创建完成后提供“进入会话”，面板内批准后打开产物。

会话记忆按 purpose 分组，编辑内容与分类通过 supersede + revision CAS；冲突保留草稿。补充整合单独读取所选父节点的锚点，经用户确认提交；relay 的接受与执行状态分开显示。辅助读取失败不能清空聊天历史。

验证入口为 `lib/topics-browser.test.mjs`、`lib/topic-creation.test.mjs`、`lib/topic-node-execution.test.mjs` 和父仓库 `scripts/topics-browser.test.mjs`。浏览器场景覆盖日常发起、两次修订、审核刷新/断线/批准/取消、创建后进入会话、节点发送/工具/停止、运行中重连、记忆 CAS、补充整合、锚点分叉与视口/缩放。精确运行结果见父仓库[纠偏方案](../../docs/development/topic-mode-correction-plan.md)与收口报告。

## 旧链接与历史（P5）

初始导航和设备快照保留可选 sessionProjectId，对应 URL 的 projectId，区别于浏览器当前选择的项目。携带 Project 的旧链接直接读取精确 Session API，并严格校验返回的 owner、readOnly 与 Session ID；迁移位置由 Backend 决定。未知链接显示失败，不改选其他项目。Home 历史 Friend 由公共 ChatWindow 正常续聊，Backend 的只读判断只用于实际受限档案；点击 Friend 默认进入今天。公共 Session 响应可带后端从节点绑定投影的 `topicNode`，解析器同时验证 owner，ChatWindow 在没有显式节点 prop 时复用它，日历/普通深链进入主题会话也走节点授权发送。不能把历史或主题误送进普通 Workflow/今日聊天。

## Friend 后台任务（LA1）

后台工作与任务展示分两处：`LongAgentTasksPanel`（从 `FriendInspector` 的任务聚合行打开）是任务/职责/后台执行的统一面板，`lib/friend-tasks.ts` 的 `buildFriendTaskRows` 为纯视图模型（plan/duty/executions 三组，occurrence 自带 work 不再重复为独立行，最新在前）；当天面板只投影会话导航，不列 works，也不显示日期标题行（日期由会话标题承载）。栏下已删除，未确认提交恢复搬进面板。

v2.8 任务与归档：Friend 会话的顶栏用 `ToolbarAction`（`data-friend-panel-toggle`，默认仅图标）**取代会话名标题**，展开会话列左侧的**全高区域**（`.workspace-friend-panel`，`data-friend-panel`，与“项目资料”同级的整块与独立滚动；Compact 覆盖会话列）。区域按日分块：会话直接按名称/类型/时间列出（`data-day-session`，空日期给一行 `data-friend-enter-day` 幂等打开该日日常会话）；任务按 任务/职责/执行 徽标显示。块头显示该日会话/任务计数（`data-friend-day`，今天不可移除）；有原生 Session 的执行行可点开（`data-task-row-open`）；已加入的日期用 `data-friend-day-remove` 移除，选中后发现为空也保留并显示空状态。过往日期用区域内 `data-friend-add-day` 打开悬浮日历的**浏览模式**（`FriendCalendar` 的 `onPickDate`：选中日期只上报、不导航），选中才加入区域，最多 7 天，持久于 `lib/friend-archive-memory.ts`（只存日期，损坏即丢弃）。任务全量仍进 `LongAgentTasksPanel`（`data-friend-tasks-open`）。未确认提交恢复保留（`data-friend-work-pending` / `data-friend-work-confirm`）。

资源对话框的重复排版使用 `src/styles/components.css` 的 `ui-*` 共享布局类（见 UI/UX §20.4）；这些类只承担布局，颜色与表面仍走 Token 与原语。

工作会话继续使用 `useAgentSession` 和 `friend-execution.ts`，没有单独聊天渲染器。FriendExecution.workId 表示固定项目工作，后续消息/引导使用执行记录的 contextProjectId，不跟随顶部项目选择；日常交流仍按下一条消息选择项目。停止单个执行、执行详情（`TaskRunDetails`）与打开原生 Session 在任务面板操作；点击 Friend 卡片是返回今日主聊的统一入口，不另设返回按钮。新增文案同时覆盖中英文；回归为 `lib/friend-work.test.mjs` 与 `lib/friend-tasks.test.mjs`（含 tasks/duties/works 三类行与去重门禁），浏览器还须验证流式、刷新、跨项目及移动布局。

LA2 任务页区分定义修订、调度应用状态和执行历史；不在浏览器计算 cron。create/run 未确认请求在 sessionStorage 保留同一 ID，重试沿用原命令；事实刷新仍来自 Backend。每次执行链接到 LA1 原生工作会话，继续使用公共实时聊天组件。

### Friend 日历与记忆目录（2026-09-27）

Friend 的日期入口位于标题展开面板内的日历按钮（`data-friend-calendar-open`），按需打开 `FriendCalendar`；全年格子与月历共用 `GET /api/long-agents/:id/daily?year=YYYY` 的 `sessions` 原生历史投影；不能用 `days` 生命周期绑定判断有消息。日期和时区来自 Backend，空壳不点亮；点击任意日期直接打开当日日常 Session，侧栏展示该日所有会话与后台工作；点击复用 `onOpenSession(sessionId, projectId)` 和公共 `ChatWindow`，保留目标会话的权限。跨日会话按实际有消息的日期显示，不只取创建或修改日期。加载/切年/失败/空月分别反馈。空日期可点，通过现有 `startProjectLongAgent({date})` 幂等打开/创建该日 Session，再走同一个导航函数；创建不运行模型、不产生任务、不会改掉默认联系人今天的目标。历史可在原会话持续交流，不回退今日。日历不影响联系人暖切换关键路径。未来按真实 Token 用量显示绿色强度，仅有注释，未把会话数量当作 Token。`friendDate` 是 URL 中的导航筛选，随同日条目切换和刷新保留，点击 Friend 清除并返回今天；不能参与接受请求或修改 Session 时间。侧栏只读派生数据，工作按 createdAt 的 Agent 本地日期或实际活动日期归入，显示开始时间区分同名执行。

Memory 目录只把 Backend `kind=project` 的实体列为项目记忆，Agent home 只在 Friend 分组出现。新增记忆的目标选择同样过滤 kind，不把当前存储 projectId 兜底塞回选择器。切到 Agent Memory 不发 Personal/Project Catalog 请求；NanoClaw 读取失败显示“暂时无法读取，不表示已删除”，无快照时显示未知数量，不能显示 0 当作已确认空库。列表/health 对非法 Agent home Project Memory 目标返回可理解的 400。

浏览器门禁复用 `scripts/session-memory-switch-browser.test.mjs`，验证历史日期到原 Session 续聊（模型看到历史）、空日期创建/重开/发送/刷新、朋友圈历史、个人记忆仍可读、Agent 不重复与断开 NanoClaw 后不误报空库。`topics-browser.test.mjs` 另验证普通 Session 深链进入主题节点后仍走节点发送入口。


## 全面更新的组件合同（2026-09-27）

全局入口为 Friend、Project、朋友圈、群聊、主题、设置。`WorkspaceSettings` 从 URL 恢复类别与项目选择；资源对话框使用当前设置项目，退出设置后恢复会话本身的资源范围。项目列表加载失败要展示错误和重试，不能伪装成无项目。

新增选择组件 `SearchSelect`、`ModelSelection` / `ThinkingSelection` 只管理临时交互，配置事实仍经 Backend 保存。`GET /api/models` 的可选 model.thinkingLevels 经运行时校验；旧后端缺该字段时不猜测支持等级。Friend 和 Workflow Agent 共用这套选择；Provider 编辑使用原有 `/api/models-config`，没有增加配置控制面。

`GroupComposer` 的草稿与待确认请求按 owner/conversation 隔离；`group-submission.ts` 验证恢复的讨论/工作输入，重试保留原请求身份。群列表与详情做目标和请求代次检查；原生 SSE 自动重连，断线时读请求补齐。`GroupWorkControls` 位于群工作区；群成员/生命周期在群内配置，主题从全局入口进入共用工作区；助手设置不再复制群聊/主题导航。Session Memory 只有公共 ChatWindow 的入口，发生 revision 冲突保留稿件并读最新版本。

会话列表的可选 `groupConversation:{conversationId,longAgentId,role}` 由 Backend 群目录投影，role 为 public/participant，和 owner 分开校验。跳转携带 groupAgent/groupProject/groupId，不把群公开/参与 Session 当普通聊天启动。后台工作 GET 可返回 displayTitle；不可改写原 work.title、请求摘要或执行绑定来美化名称。

设计基线与组件样式见 [UI/UX §17](./ui-ux-guidelines.md#17-全面更新基线2026-09-27)。实施覆盖与验证见父仓库 [全面更新工作记录](../../docs/development/frontend-renewal-plan.md)。

主题节点的统一会话记忆开关由节点策略控制，调用既有节点 PATCH 并携带 expectedRevision。ChatWindow 通过 useTopicMemoryControl 按 topicNode 身份读取和更新策略，主题地图、日期记录和直接会话链接走同一控制器；加载中不显示默认勾选，失败可重试。策略值同时用于展示和下一次发送；策略更新不能卸载当前会话。409 保留用户编辑并读回最新服务端状态。不可把普通 Session 的浏览器偏好当成主题节点已持久化事实。

Friend 助手设置将 Prompt、工具、技能、资源及渠道设为按需展开的配置组；保存动作保持可见。Plugins/Extensions 的范围显示个人/当前项目，安装与加载位置由 Backend 管理，不硬编码 Pi 默认目录作为 Chat 安装事实。

## 界面语言实现合同

`lib/i18n/preference.ts` 定义英语默认值与唯一存储键 `pi-locale`，`I18nProvider` 首次渲染读取显式偏好，并维护 `<html lang>`。禁止根据 `navigator.language` 自动覆盖默认值或用户选择。设置中的语言切换不影响执行参数和资源作用域。

组件通过 `useI18n()` 获取 `t` 和 `locale`；翻译由 `messages/en.ts`、`messages/zh-CN.ts` 及共有的 `messages/interface.ts` 提供。日期/数字展示传入 `locale`；配置枚举值、分组 key 与数据 ID 保持稳定，只翻译显示标签。已有可识别的操作提示经 `InterfaceFeedback` 随语言重新显示；未知诊断展示本地化摘要，可展开原文。不要将此组件用于对话正文、用户名称或任意资源内容。

Pi 完整历史通过 `history-locale.ts` 对固定上游版本的阅读器控件做局部呈现适配，不改写 Session 数据、消息正文、提示词或工具结果。上游变更时需检查控件选择器；`public/offline.html` 无应用 bundle，独立读取同一偏好，默认英文。静态 Manifest 声明英语。

`lib/i18n.test.mjs` 检查双语键/参数、直接文案与翻译引用、默认值、原始诊断保留和离线行为；`history-document.test.mjs` 检查历史数据不变及控件刷新；父仓库 `scripts/session-memory-switch-browser.test.mjs` 用真实浏览器验证双向切换、刷新、模型弹窗及离线语言。

内置工作流名称、说明和步骤标签经 `translateWorkflowCopy()` 按工作流 ID 与原始默认文案匹配翻译；用户改写的名称、说明与第三方工作流原样显示。不把本地化显示值送回配置或执行 API。

### 共用动作与模态基础（2026-09-27；v2.4 修订 2026-09-29）

动效与复用门禁：`lib/motion-contract.test.mjs` 断言所有 `transition` 使用 `--duration-*` 与 `--ease-*` Token、pressed 不使用 `filter:brightness()`、每个遮罩淡入（Radix 浮层还淡出）、`data-ui-button` 只由共享 `Button` 声明、`role="dialog"` 手写浮层不超出记录在案的迁移清单。新增动画只允许循环指示或一次性揭示，并在该测试的允许清单中登记。规范语义见 [UI/UX §8.2 与 §20](./ui-ux-guidelines.md#82-浮层与遮罩动效)。

`components/ui/Button.tsx`、`PageHeader.tsx` 负责动作外观与一致的左侧返回；`SurfaceDialog` 基于固定版本 Radix Dialog，`ConfirmationProvider` 基于 AlertDialog，业务组件通过 `useConfirmation` 等待用户决定。列表选择不是动作按钮。不要新增 `window.confirm` 或复制页面级按钮样式。焦点、Escape、窄屏布局的真实浏览器回归随 `test:dev` 执行。

v2.3 art 方向实现合同（规范语义见 [UI/UX 规范 §18.5](./ui-ux-guidelines.md#185-视觉精度合同v23-art-方向)）：

- **阅读节奏**：`--measure-prose:42rem`、`--rhythm-body:1.7`、`--tracking-body:0.002em` 定义在 `precision.css` 的 `:root`；`.markdown-body`、设置正文、目录详情共享；`workspace-message-column` 对齐同一量级，宽屏仍为显式 opt-in。
- **表面与圆角**：`--surface-fine` 细边 + `--shadow-popover` / `--shadow-dialog` 两档；`--radius-control/panel/dialog` 唯一体系；工具栏图标与按钮已对齐并补 Token 过渡。
- **语义色收敛**：`--on-accent`、`--danger`、`--success`、`--warning`、`--accent` 全量替换硬编码色；画布 JPEG 底与品牌 SVG 路径黑是内容语义例外。
- **动效收敛**：27 处 `0.12s` 魔法时长已批量替换为 `var(--duration-fast)`；`FileExplorer` 进度条、`components.css` resize 手柄同步 Token 化。
- **Dialog 定位陷阱**：Dialog 内禁止 `position:fixed + 全屏侧栏偏移`；`LongAgentSettingsPanel` footer 已锚到对话框盒；嵌套 picker/editor 统一 1110（主层 1100/1101）。

### 设计精度与代码高亮（2026-09-28）

第一批 UI/UX 门禁落地的实现合同，规范语义见 [UI/UX 规范 §18](./ui-ux-guidelines.md#18-设计精度基线与交互一致性合同2026-09-28)。

- **依赖**：新增 `@fontsource-variable/instrument-sans`、`@fontsource-variable/jetbrains-mono`（品牌字体，`src/main.tsx` 引入）、`shiki`（代码高亮）、`sonner`（toast）、`cmdk`（命令面板）；已移除 `react-syntax-highlighter` 及其类型包。依赖变更按 §1 同步自身与父仓库锁文件。
- **代码高亮**：`lib/highlight.ts` 是唯一高亮入口。基于 `shiki/core` 懒加载单例 + oniguruma 引擎 + `shiki/wasm`；语法按需动态 import（`LANGUAGE_LOADERS`），未知语言与超 120K 字符渲染转义纯文本，结果走 200 条 LRU。组件侧统一用 `components/ui/SourceCode.tsx`；不得再引入其他高亮库或在组件内直接调用 shiki。`lib/highlight.test.mjs` 覆盖文件名到语言映射。
- **文件查看器行结构**：transformer 将输出改写为 `.file-source-line[data-line-number]` > `.file-source-line-content`，行号由 CSS counter 伪元素渲染；`FileViewer` 的行选择/引用逻辑与 diff 视图依赖该合同。
- **Toast**：`components/ui/FeedbackToaster.tsx` 包装 sonner，挂载于 `DeviceWorkspaceRoot`；非阻断反馈用 `toast.error/info`（i18n 键），阻断性错误仍走 `role=alert` + `InterfaceFeedback`，两者不得混用。
- **命令面板**：`components/ui/CommandPalette.tsx`（cmdk）为导航专用入口；⌘K 监听在 AppShell capture 阶段统一注册，存在模态 Dialog 时不抢占。命令只调用 AppShell 既有回调。`new-session-draft.test.mjs` 按源码切片提取 AppShell 的 useCallback 块，AppShell 中这些回调之间的代码不得引入组件作用域外的 hook 调用。
- **全局样式**：`color-scheme`、`::selection`、全局 `:focus-visible`、窄滚动条、shiki 双主题变量切换、命令面板样式集中在 "Design precision baseline" 区块；阴影 Token `--shadow-popover`/`--shadow-dialog` 为多层阴影，组件不得自造。

### 浮层原语、动效 Token 与样式拆分（2026-09-28）

第二批/第三批 UI/UX 门禁落地的实现合同，规范语义见 [UI/UX 规范 §8.1 与 §18.4](./ui-ux-guidelines.md#18-设计精度基线与交互一致性合同2026-09-28)。

- **依赖**：新增 `@radix-ui/react-tooltip`、`@radix-ui/react-popover`、`@radix-ui/react-dropdown-menu`；依赖变更按 §1 同步自身与父仓库锁文件。
- **浮层原语**：`components/ui/Tooltip.tsx`（`Hint` + `TooltipProvider`，Provider 挂载于 `DeviceWorkspaceRoot`）、`components/ui/Popover.tsx`、`components/ui/DropdownMenu.tsx` 是浮层的唯一入口；内容统一 portal 并携带 `.ui-tooltip`/`.ui-popover`/`.ui-menu` 浮层类（`src/styles/precision.css`）。Escape、outside-click、键盘导航、定位翻转由 Radix 提供，页面不得手写。图标按钮接入 `Hint` 后删除原 `title`、保留 `aria-label`。存量自制浮层按此合同逐步收敛（`DeviceSwitcher` 已迁移）；移动端底部 action sheet 属于 Sheet 模式，不按菜单收敛。
- **动效 Token**：`--duration-fast`(120ms)/`--duration-panel`(200ms)/`--duration-overlay`(240ms)/`--ease-out`/`--ease-standard` 定义在 `src/styles/tokens.css` 的 `:root`；新增 `transition`/`animation` 必须引用 Token。全局 `prefers-reduced-motion: reduce` 兜底位于 `precision.css`，组件不得依赖动画时长维持逻辑正确。
- **样式拆分**：`src/styles.css` 只是按声明顺序 `@import` 的聚合入口，实际规则分布在 `src/styles/` 的 `tokens.css`（`@theme`+Token）、`base.css`、`components.css`、`workspace.css`、`precision.css` 五层；拆分为纯机械移动，类名与级联顺序不变。测试源码断言统一使用 `lib/style-sources.ts` 的 `readStyleSheetSources()` 读取聚合源，新增样式源文件时必须同步该列表。

侧面板统一使用 `.workspace-dock`（`src/styles/components.css`）：`.is-open`/`.is-closed` class 开合、`--dock-width` 决定宽度、`--duration-panel` + `--ease-standard` 过渡、内层固定宽避免重排、`.is-resizing` 关闭过渡；列表侧栏、项目资料、任务与归档三处共用，Compact 走覆盖 + `transform`。`--dock-width` 必须是绝对长度：原语同时用它设定面板与内层宽度，百分比会二次解析并使内容被压窄。门禁在 `lib/motion-contract.test.mjs`。

工具类中的 `ToolbarAction`（`components/ui/ToolbarAction.tsx`）是工具栏动作的唯一形态：默认仅图标，设置 → 外观 → “工具栏操作”可开启“图标与文字”（`chat:toolbar-labels`，`hooks/useToolbarLabels.ts`）。新增任何带文字的工具栏按钮必须走它，不得各自渲染文本标签。全局主导航（`WorkspaceNavigation`）与顶栏分支动作（`BranchNavigator` 的内联按钮）同样读取该偏好：默认仅图标 + `Hint`；Compact 保留可见名称，因为触控没有 hover。

每日归档接口和运行时校验位于 `lib/friend-day-archive.ts`，`FriendDaySummary` 只读取 Backend 日目录，不自行推算 cron 或把执行结束视为文件已保存。聊天设置菜单保留原有发送偏好，变更需覆盖 `scripts/prompt-capture-browser.test.mjs` 的菜单切换、刷新、实际发送与历史阅读链路（父仓库）。

### 配置表单与能力检查（2026-09-30）

Friend、Workflow 和模型配置复用 SurfaceDialog/标准按钮。模型导航必须有固定收缩边界，详情独立滚动，不能在 SurfaceDialog 内再次套旧 dialog 尺寸。Workflow 高级工具/资源按需展开，身份长期指令位于 Friend 设置前部。

模型能力来自 `/api/models` 的 input/contextWindow/maxTokens/thinkingLevels，缺失输入信息显示未知。模型高级 JSON 错误阻止保存，配置读取失败也不得用空默认覆盖服务端配置。Friend 保存后重新检查自身 Home 基础能力；业务轮次权限仍由 Backend 按冻结项目决定。所有对象切换和刷新清除旧检查，迟到响应不能覆盖当前对象；刷新要经过未保存草稿保护。

跨层浏览器回归由父仓库 `scripts/configuration-browser.test.mjs` 使用隔离 CHAT_HOME、真实构建服务、假 Nano/模型运行，覆盖图片与采样参数保存回读、错误 JSON、长名称和宽窄屏布局；不访问正式配置。


### 执行完成提示与配置折叠（2026-09-30）

完成提示归属整次 Workflow Run / Friend turn；Pi `agent_end`、某个 Stage 完成和流断开都不能独立触发成功音。`useAgentSession` 传递包含项目、Session、执行 ID 与终态的 `onExecutionSettled`；AppShell 统一按执行 ID 去重。后台 Session 离开运行列表后只触发一次事实读取，确认成功才播放；失败、取消、仍在运行及读取失败保持静默。去重集合只是当前页面的通知投递记录，不能充当执行状态源。等待用户输入仍有独立提示。现有单次提示音包含两个音符。

Friend / Workflow 使用同一个 `ConfigurationSection` 折叠行和模型、思考强度选择器。模型参数入口复用全局 `ModelsConfig`，定位当前模型，明确后续所有使用该模型的 Agent 均受影响；关闭嵌套编辑器保留父级草稿。保存后重新读取模型目录与生效检查，失败可重试。模型配置仍经现有 Backend API 保存，没有新增 Agent 级采样参数合同。

门禁：`lib/execution-completion.test.mjs` 覆盖状态确认、归属校验和前后台重复观察；根仓库 `scripts/session-memory-switch-browser.test.mjs` 在真实双 Agent Workflow 中检查第一个 Agent 完成无音、最终完成一次音；`scripts/configuration-browser.test.mjs` 检查关闭行高度、嵌套编辑保存与草稿保留、能力刷新及不同视口。

### 2026-09-30：会话过程和 Long Agent 配置

- Agent Memory 写入产物使用回执中的所有者、资源路径与 revision，打开 Agent Memory API 查看器，不进入项目文件 API；旧回执仅可使用当前服务端 Session 所有者补全身份。
- Completed 内按 invocation、stage、agent 分组；主回复属于工作节点，记忆节点只展示维护过程及真实写入回执。没有写入回执不得声称已保存。失败/取消/关闭的记忆节点使用服务端持久状态。
- Long Agent 设置复用 `WorkflowAgentConfigDialog`。Home 配置是服务端事实；身份表单只修改身份字段，刷新公共配置后保留未保存身份草稿。执行字段不再提供独立编辑器。
- “新会话”创建独立直接 Session，“当天默认会话”返回默认引用；刷新按服务端 owner 恢复。浏览器只临时保留未确认创建 requestId，用于失败重试，Session ID 与日期归属由服务端确定。
- Full history 保留原生 HTML、分支与压缩记录；请求取消、错误重试及 Session 切换隔离必须保留。耗时分请求总时间和缓存生成时间，不能以生成耗时冒充缓存命中耗时。
