# Chat Pi Web Frontend 协作规则

## 产品边界

本仓库是 Chat 的纯浏览器前端。Chat 后端拥有认证、Session、文件访问、Workflow 和 Pi 运行时；前端只能通过公开 HTTP API 使用这些能力。

不得在本仓库中新增服务端路由、直接文件系统访问、AgentSession、Pi SDK 运行依赖或第二套执行控制面。

## 上游维护

- `origin`：Later 的公开仓库`later-3/chat-frontend`。
- `upstream`：只读官方仓库 `agegr/pi-web`。
- Chat固定使用本仓库`main`分支上经过验证的确定提交。
- 上游浏览器端 Bugfix 优先 Cherry-pick 或窄范围移植；不得把上游 Next.js 后端重新引入本分支。

## 工程规则

- 修改 Frontend 代码、HTTP 合同、目录结构、状态管理、测试或交付流程前，必须完整阅读 [Chat Frontend 开发指南](./docs/development.md)。
- 本文件只保留协作入口和不可违反的边界；开发方法、文件位置和命令由开发指南说明，不在这里重复。
- TypeScript 保持 `strict`。
- 网络边界必须验证响应结构。
- 页面组件不拥有服务端事实。
- PWA 图标、Manifest、Service Worker 和移动布局变化必须同步更新测试。
- 注释描述实际目的、输入、输出和失败方式，不使用含糊术语。

## UI/UX规范

- 涉及任何前端功能开发、优化或评审前，必须完整阅读[前端设计方法与案例](./docs/frontend-design-method.md)，先在仓库文档记录任务、信息清单、信息关系和表达推导，再实现并回写验证。小修改使用该文档的最小记录，不跳过分析。

- 设计、实现、重构或评审任何页面、组件和交互前，必须完整阅读 [Chat Frontend UI/UX规范](./docs/ui-ux-guidelines.md)。
- 规范文档是视觉、交互、Web/PWA、自适应和无障碍要求的事实源；本文件只声明强制入口，不复制其内容。
- 现有实现与规范不一致时采用渐进治理：不得扩大不一致，本次触达区域应在任务范围内向规范收敛。

## 质量门禁 Skills

以下 Agent Skills 是规范的可执行验收清单，生成或评审 UI/React 代码时按清单自查：

- [web-design-guidelines](./.agents/skills/web-design-guidelines/SKILL.md)：UI 交互质量门禁（焦点、键盘、loading、动效、表单、设计 token），源自 Vercel web-interface-guidelines（MIT，已适配 Vite SPA）。
- [react-best-practices](./.agents/skills/react-best-practices/SKILL.md)：React 性能与质量门禁（瀑布、bundle、重渲染、渲染、JS 性能），源自 Vercel react-best-practices（MIT，已去除 Next/RSC 专属规则）。

Skills 内容与规范文档冲突时以规范文档为准；修改 skill 中的项目适配映射（token 名、文件路径、模式先例）时须同步核对对应文档。

## 文档索引

- [前端设计方法与案例](./docs/frontend-design-method.md)：业务与信息关系到界面的必走流程、工作流案例、全局外观分层及迭代验收。
- [Frontend 开发指南](./docs/development.md)：工程职责、开发方式和交付流程。
- [Frontend UI/UX 规范](./docs/ui-ux-guidelines.md)：视觉、交互、Web/PWA、自适应和无障碍事实源。
- [上游同步说明](./UPSTREAM.md)：上游来源、基线和移植边界。

修改上述规则覆盖的行为时，必须在同一任务中更新对应文档和验证；不得只修改代码。

## 验证

代码改动至少运行：

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Git

- 只提交当前任务修改的文件。
- 不使用 `git add .`、`git add -A`、`git reset --hard` 或强制推送。
- Chat 更新前端后，先提交并推送本仓库，再在 Chat 中更新 Submodule Commit。
