# Chat Pi Web Frontend

这是 Chat 使用的纯浏览器前端，来源于 Pi Web，当前使用 Vite + React 构建。

## 文档

- [Frontend 开发指南](./docs/development.md)：职责边界、目录、HTTP 合同、状态管理、验证和 Submodule 交付。
- [Frontend UI/UX 规范](./docs/ui-ux-guidelines.md)：页面设计、Web/PWA 交互、响应式和无障碍要求。
- [上游同步说明](./UPSTREAM.md)：Pi Web 来源、基线和同步边界。

本仓库只负责界面和浏览器交互：

- 通过 Chat HTTP API 读取 Session、文件、模型和设备信息。
- 通过 Chat HTTP API 选择并启动 Workflow。
- 提供 PWA、移动端布局、离线页面和浏览器通知表面。
- 不包含 Next.js 后端，不创建 AgentSession，不读取服务端文件系统。
- 不直接依赖 Pi SDK。

多设备切换仍由前端完成，但设备目录来自运行中的Chat Backend `/api/devices`。真实设备名和URL保存在Backend的`$CHAT_HOME/devices.json`，不会写入Vite环境变量、静态产物或本仓库；浏览器合同只接受`id`、`name`和根URL。

## 本地验证

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

## Chat 接入

Chat 将本仓库作为 `frontend/` Submodule 固定到经过验证的提交，并执行：

```bash
pnpm --dir frontend build
```

上游来源、基线和同步边界见 [UPSTREAM.md](./UPSTREAM.md)。

页面设计、Web/PWA交互、主题、排版、响应式和无障碍要求见
[Chat Frontend UI/UX规范](./docs/ui-ux-guidelines.md)。
