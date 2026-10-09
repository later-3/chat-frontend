# 项目树侧栏信息架构（LA→Project→Session dock：L0/L1/L2）

> 归因纠偏（2026-10-08）：红框对象是项目树 dock `LongAgentProjectTree`（`AppShell.tsx:2210-2215`），不是 `SessionSidebar`。`git log -S "添加项目" -- frontend/components/SessionSidebar.tsx` 为空，SessionSidebar 从未有过“＋添加项目”。本记录按真实落点重写。

任务与入口：用户在项目树 dock 对“当前项目下的会话集合”完成确认在哪 / 换项目 / 找会话 / 新建 / 管单条；入口为 dock 头部 L0+L1，退出为进入对话或换项目刷新。约束：不新增快捷键。

当前问题与证据（历史，已修）：`＋ 添加项目`（旧 `LongAgentProjectTree.tsx:261-263`）浮在 L0 项目列表与 L1 头部之间，层级错位；行 `...`（旧 `:304`，`SessionActionsMenu.tsx:29-31`）被感知与顶排重复；搜索触发小（旧 `:268` 的 `⌕` 字形按钮，`session-actions-trigger`，`components.css:1519-1545`）且与全应用 `ToolbarAction`（36px + `Hint`，`components.css:1240`）脱节；头部是按钮堆叠，无 L0/L1/L2 分区。

修订（2026-10-09 用户评审）：①新增/管理动作与所在层对齐——`＋ 添加项目` 上到 L0 的 Projects 标题行（与 `＋新建会话` 同为 `ToolbarAction`+`IconPlus`，虚实区分层级）；②行内 `…` 删除，`重命名/移除` 上到 L1 那一行（选中即当前会话，`disabled` 无选中）；③L1 不再重复项目名（L0 高亮即所在）；④项目树与长期助手面板改为**可调节宽度**（与 sidebar/文件面板同 `useResizablePanel` 底座）；⑤不设分支第二入口（分支保留顶栏，案例 T1）。

信息清单：见任务 `02-design.md §5` 原子信息表（当前项目 / 自定义路径 / 会话行 / 标题 / 移除恢复彻底删 / 已移除集合 / 查询 / 范围日期 / 片段预览 / 刷新 / 视图菜单 / 新建）。

关系推导：

| 关系 | 表达 | 选择原因 | 窄屏表达 |
|---|---|---|---|
| L0 包含项目（我在哪） | Projects 标题行：标题 + `＋ 添加项目`（`ToolbarAction`） | 加项目是该集合自身操作，与所在层同行（前端规范第四步/第七步） | 保持全宽 |
| L1 作用于集合（搜索/移除区/选择/重命名/移除/新建） | `ToolbarAction` 一排，36px/图标 18px + `Hint`；`＋新建会话` 同底座 | 与全应用底座一致；行级动作随选中会话，不再每行一套（第七步） | 触击 44px（既有 CSS） |
| L2 会话行 | 纯信息行（标题 + 类型 + 条数），无每行 `…` | 同一动作只有一处；低频危险动作（改名/移除）收进 L1 且需先选中（前端规范第三步） | 同左 |
| 搜索是集合查找（查询→片段→预览→打开） | 图标点击直接开既有 Overlay（`SurfaceDialog` 自带 Esc、无快捷键） | 底线不加快捷键；Raycast 式已定模式；保既有浏览器验收合同 | 同左，浮层全宽 |
| 面板宽度 | 项目树/长期助手面板 `useResizablePanel`（`--project-tree-width`/`--friend-panel-width`，拖拽+`localStorage`记忆） | 与 sidebar/文件面板同一可调节容器（共用 `.workspace-dock`） | 窄屏抽屉 |

参考与取舍：`ToolbarAction+Hint`（产品内既有，`ChatWindow/AppShell`）；`chat-session-management-frontend.md`（Slack/Notion 行菜单、Raycast 搜索）；LobeHub/Cherry Studio（布局数值）；OpenBot/OpenWork（作用域/恢复/密度）；Radix/`cmdk`/`sonner` 既有依赖，不引新库。

实施映射：L1 迁 `ui/ToolbarAction`；`＋ 添加项目` 进 L0 Projects 标题行；行级 `重命名/移除` 从 `SessionActionsMenu` 上到 L1（`data-session-action`），会话行保持干净；搜索保持 `SessionSearchOverlay`（按钮触发无快捷键）；项目树/长期助手面板接 `useResizablePanel`；`ToolbarIconButton` 冻结不再新增实例。保存语义：新建依赖当前项目（Workspace 不显示新建）；危险动作确认；本地偏好（视图、面板宽度）不写后端。

验收：同一屏同一信息一次；L1/会话行职责可说清；搜索触击 36px（粗指针 44px）；面板宽度可拖拽且记忆；`pnpm verify` + `git diff --check`；窄屏基本可用。

修订：D1–D6 已同意（2026-10-08）并按倾向执行；2026-10-09 按用户评审完成 L0/L1 对齐与可调宽度；命名清理（`CHAT/项目/Chat`）与批量管理态另开待办。
