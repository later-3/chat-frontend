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

Workflow与长期Agent共享同一个Project和Chat Session模型，但不是输入区中的同一种选择项。Project侧边栏在同一Project上下文中提供互斥的“会话 / 长期同事”导航面板，默认显示“会话”。“会话”面板必须保留旧有普通Session的布局、列表信息和新建入口，不得为Long Agent预留占位；“长期同事”面板展示同事在当前Project中的唯一专属主Session入口和设置。专属主Session不在普通Session列表重复展示。

Daily是用户的个人日常Project，不是一套额外的个人模式。Daily与其他Project必须共用同一套导航面板、Session和Long Agent交互逻辑。

手动切换侧边栏导航面板不改变中央区已打开的会话。打开普通Session或使用“新建会话”时必须切回“会话”面板；打开Long Agent或页面刷新后当前`session.owner.type === "long-agent"`时，必须切到“长期同事”面板。普通Session在输入区选择Workflow；长期Agent专属Session在输入区显示当前同事身份，不允许把普通Session原地切换为Long Agent Session。Frontend通过`GET /api/long-agents`恢复可用Agent和Project状态，通过`POST /api/long-agents/:id/start`完成单击启动/打开，通过`POST /api/long-agents/:id/messages`提交文本并等待Chat Pi完成本轮，再重新读取原生Session事实。

Session列表与Session详情中的`session.owner`是导航和发送链共用的唯一归属事实。Frontend运行时合同必须接受且严格校验`{ type: "ordinary" }`或`{ type: "long-agent", longAgentId, projectLongAgentId }`，并直接用该值选择面板与发送API。Long Agent列表只用于展示同事和配置/运行状态，不得异步用`primarySessionId`反推Session归属；也不得根据消息内容猜测，或在Hook/组件中维护第二份映射。`owner`缺失、非法或无法解析时必须停止发送并告警/重新加载，不得默认当成Workflow Session继续执行。

“长期同事”面板中同事条目的设置操作打开Long Agent配置页。这个入口虽位于当前Project侧边栏，但管理的是跨Project持续的Personal `LongAgent`与其一对一映射的NanoClaw Agent Group；当前`ProjectLongAgent`仍只有Project启停状态和唯一主Session。页面固定分成三个来源清晰的标签页：

1. “运行策略”编辑Chat Personal配置中的显示别名、列表摘要、全局启停、默认Project、Model、Thinking Level、System Prompt/自定义Prompt、Tools和Resources；这里的别名不是Agent运行身份。
2. “Agent Group”编辑NanoClaw拥有的运行身份名称和Standing Instructions，并只读展示稳定Group ID、Workspace安全摘要、核心Memory快照、revision和stale状态。
3. “Agent Memory”管理该Agent Group自己的OKF Markdown文件，支持列表、搜索、打开、新建、编辑和确认删除。

Agent Group与Agent Memory通过Backend的安全投影进入浏览器。Frontend不得直接读取NanoClaw目录或数据库，也不得接收宿主机绝对路径、Telegram Credential、服务Credential、事件游标、Nano容器Provider或容器运行状态。Workspace与Memory路径只能是拒绝绝对路径、反斜杠、`.`和`..`段的相对路径。所有保存按内容revision做乐观并发保护；`409`必须保留或明确处理页面草稿，不能自动覆盖新版本。Chat运行策略、Agent Group和Agent Memory配置均从下一轮Long Agent对话开始装配，页面不提供含义模糊的Agent进程操作。

需要新增或改变服务端事实时，先修改父仓库 Backend 的合同，再让 Frontend 使用该合同。

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

Long Agent配置使用`GET /api/long-agents/:id/config`和`PUT /api/long-agents/:id/config`。GET响应包含`schemaVersion`、`revision`、可编辑Agent Definition和只读Channel/Host摘要；PUT提交完整表单与`expectedRevision`。后端用revision做乐观并发控制并原子保存；`409`表示基线已过期，前端应保留用户可见的草稿或告知差异，重新加载服务端事实，不得不带条件重试覆盖。保存成功后必须使用响应中的新revision和正规化配置替换本地基线。

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

- Backend 和 Pi Session 是持久事实源；页面组件只拥有输入草稿、选中项、展开状态、加载状态等界面状态。
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
