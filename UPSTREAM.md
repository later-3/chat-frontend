# 上游来源

本仓库从 Pi Web 的浏览器端源码演进而来，只发布Chat使用的Vite前端。公开历史从经过隐私审计的纯前端快照开始；旧设备库存、SSH、隧道和个人运维记录不属于本仓库。

- Later公开仓库：<https://github.com/later-3/chat-frontend.git>
- Chat长期分支：`main`
- 官方只读上游：<https://github.com/agegr/pi-web.git>
- 上游许可证：MIT，见 [LICENSE](./LICENSE)

Chat 后端拥有认证、Session、Workflow 和 Pi 运行时。本分支只能通过 HTTP 访问这些能力，不能导入 Pi SDK、创建 AgentSession 或读取服务端文件系统。
