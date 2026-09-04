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

- TypeScript 保持 `strict`。
- 网络边界必须验证响应结构。
- 页面组件不拥有服务端事实。
- PWA 图标、Manifest、Service Worker 和移动布局变化必须同步更新测试。
- 注释描述实际目的、输入、输出和失败方式，不使用含糊术语。

## UI/UX规范

- 设计、实现、重构或评审任何页面、组件和交互前，必须完整阅读 [Chat Frontend UI/UX规范](./docs/ui-ux-guidelines.md)。
- 规范文档是视觉、交互、Web/PWA、自适应和无障碍要求的事实源；本文件只声明强制入口，不复制其内容。
- 现有实现与规范不一致时采用渐进治理：不得扩大不一致，本次触达区域应在任务范围内向规范收敛。

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
