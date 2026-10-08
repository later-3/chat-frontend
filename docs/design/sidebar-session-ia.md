# 会话侧栏信息架构（Session 头：L0/L1/L2）

任务与入口：用户在会话侧栏对“当前项目下的会话集合”完成确认在哪 / 换项目 / 找会话 / 新建 / 管单条；入口为 Session 头 L0+L1 与行 hover `...`（L2），退出为进入对话或换项目刷新。约束：不新增快捷键。

当前问题与证据：`+添加项目` 在 Session 头（`SessionSidebar.tsx:1117-1142`），与项目下拉底部“自定义路径”同一功能两处出现；行 `...`（`SessionActionsMenu.tsx:29-31`）被感知与顶排重复；搜索触发小（自造 `ToolbarIconButton size=26`，`:40-99`）且与全应用 `ToolbarAction`（36px + `Hint`）脱节；头部是按钮堆叠，无 L0/L1/L2 分区。

信息清单：见任务 `02-design.md §5` 原子信息表（当前项目 / 自定义路径 / 会话行 / 标题 / 移除恢复彻底删 / 已移除集合 / 查询 / 范围日期 / 片段预览 / 刷新 / 视图菜单 / 新建）。

关系推导：

| 关系 | 表达 | 选择原因 | 窄屏表达 |
|---|---|---|---|
| L0 包含当前项目（我在哪） | 下拉独占一行，底部收敛“自定义路径…”唯一加项目入口 | 同一批信息不设第二套入口（前端规范第四步） | 保持下拉全宽 |
| L1 作用于集合（搜索/刷新/视图/新建/移除区） | `ToolbarAction` 一排，36px/图标 18px + `Hint` | 与全应用底座一致；信息不重复（第七步） | 触击 44px（既有 CSS） |
| L2 作用于单行（改名/移除/恢复/彻底删） | 行 hover `...` 唯一入口（Radix Menu） | 低频危险动作收进菜单（前端规范第三步） | 无 hover 时常显置灰 |
| 搜索是集合查找（查询→片段→预览→打开） | 图标点击行内展开输入，Esc 收起；完整筛选进既有 Overlay | 底线不加快捷键；Raycast 式已定模式 | 同左，输入全宽 |

参考与取舍：`ToolbarAction+Hint`（产品内既有，`ChatWindow/AppShell`）；`chat-session-management-frontend.md`（Slack/Notion 行菜单、Raycast 搜索）；LobeHub/Cherry Studio（布局数值）；OpenBot/OpenWork（作用域/恢复/密度）；Radix/`cmdk`/`sonner` 既有依赖，不引新库。

实施映射：L1 迁 `ui/ToolbarAction`；L2 保持 `SessionActionsMenu`（Radix）补说明与对齐；搜索保持 `SessionSearchOverlay`（按钮触发无快捷键）；`ToolbarIconButton` 冻结不再新增。保存语义：新建依赖 `selectedCwd`，disabled 配 `Hint`；危险动作确认；本地偏好（视图）不写后端。

验收：同一屏同一信息一次；顶排/行菜单职责可说清；搜索触击 36px（粗指针 44px）；`pnpm verify` + `git diff --check`；窄屏基本可用 + 真机截图。

修订：D1–D6 待用户定论后回写；命名清理（`CHAT/项目/Chat`）与批量管理态另开待办。
