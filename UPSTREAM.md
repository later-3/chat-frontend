# 上游来源

本仓库从 Pi Web 的浏览器端源码演进而来，只发布Chat使用的Vite前端。公开历史从经过隐私审计的纯前端快照开始；旧设备库存、SSH、隧道和个人运维记录不属于本仓库。

- Later公开仓库：<https://github.com/later-3/chat-frontend.git>
- Chat长期分支：`main`
- 官方只读上游：<https://github.com/agegr/pi-web.git>
- 上游许可证：MIT，见 [LICENSE](./LICENSE)

Chat 后端拥有认证、Session、Workflow 和 Pi 运行时。本分支只能通过 HTTP 访问这些能力，不能导入 Pi SDK、创建 AgentSession 或读取服务端文件系统。

## 2026-09-17 选择性同步

移植上游 `77ffe3c` 的未发送草稿保护：在切换项目、打开历史会话和自动恢复会话前，按工作目录暂存文字与图片；返回新会话时恢复。连续新建会话同样保留未发送内容。草稿仍仅属于当前页面内存，不声明刷新后持久化。

`lib/new-session-draft.test.mjs` 执行实际导航回调和卸载清理，覆盖普通目录及跨 worktree 自动恢复。Chat 使用 Workflow Run 事件，因此不移植上游旧 SSE 路径的 `4787a14`；不引入 Next.js、Pi SDK 或服务端运行时。
