# Long Agent 定义配置与前会话定位三要素

版本：1.0；2026-10-05。对应任务 `pi-001`（阶段 P4 / P6 / P8）。
按 [前端设计方法](../frontend-design-method.md) 的顺序记录推导；实施与验收回写在本文件末尾。

## 1. 任务

- **P4（会话定位）**：用户在项目树或长期同事面板里点开一个会话时，需要明确“这是**哪个长期同事**、在**哪个项目**、哪条会话”。
  成功＝地址栏可分享/可刷新且归属唯一；离开后从历史返回仍回到同一会话。
- **P6（能力归组）**：用户配置助手时要能分辨“**它是什么**”与“**它能做什么**”；成功＝定时任务与长期职责出现在“能力”之下，
  不与身份/规范/记忆平级。
- **P8（可解释）**：用户要能确认“这一轮到底装了什么、依据哪一版规范”；成功＝设置面板里能看到本轮生效 revision 与区域构成。

## 2. 信息清单

| 信息 | 来源 | 读/写 | 范围 | 状态 |
|---|---|---|---|---|
| 会话归属 Long Agent | `SessionInfo.owner.longAgentId`（`/api/sessions/:id`） | 读 | 单会话 | 服务端事实 |
| 会话所属项目 | `SessionInfo.projectId` | 读 | 单会话 | 服务端事实 |
| 当前选中会话 id | 前端导航状态 | 读写 | 窗口 | URL 同步 |
| 助手构成项（身份/规范/记忆/项目） | `GET /api/long-agents/:id/config` | 读 | 单助手 | 有 revision |
| 助手能力项（模型/工具/技能；定时任务/长期职责） | 同上 + 任务/职责接口 | 读 | 单助手 | 任务为定义+状态 |
| 注入开关（交互 harness / Agent Memory） | `LongAgentConfigurationDocument.agent` | 读写 | 单助手 | 缺省 on |
| 本轮 prompt 区域构成 | `GET /api/long-agents/:id/inspection` → `prompt.regions` | 读 | 本轮 | 名称/revision/字符数 |

## 3. 关系推导

| 关系 | 表达 | 原因 | 窄屏 |
|---|---|---|---|
| 归属（会话 ← Agent + Project） | 地址栏三参数 `agent`/`project`/`session`，打开时以服务端事实写入 | 定位必须唯一且可分享；提示只作线索 | 同（URL 与应用态一致） |
| 构成 vs 能力（并列两大类） | 侧栏两组标题：**构成**（规范、记忆与通道）/ **能力**（能力、定时任务、长期职责） | 定义里“是什么”与“能做什么”性质不同，不应平级混排 | 分组标题保持，标签纵向排列 |
| 依据（配置 ← 本轮生效版本） | 「规范」标签显示 revision + 字符数；下方列出区域构成 | 用户要能回答“为什么这样回答” | 列表换行展示 |
| 定义 ← 生效（保存 → 下一轮） | 保存后提示，注明下一轮生效 | 受理时冻结，避免同一轮规则前后不一致 | 同 |

## 4. 参考与取舍

- 参考：既有「助手设置」对话框的标签-面板结构与 `SurfaceDialog` 契约（沿用，不新造弹层）；
  参考浏览器地址栏作为“可分享定位”的成熟做法。
- 不照搬：不引入独立的“会话详情页”；不把区域构成做成独立页面（信息属于“本轮装配”，与助手设置同源）。

## 5. 实现映射

| 关系 | 组件 / 模块 |
|---|---|
| 三要素 URL | `lib/initial-navigation.ts`、`lib/device-workspace.ts`、`components/AppShell.tsx`、`components/SessionSidebar.tsx`、`components/ProjectLongAgentSection.tsx` |
| 分组与开关 | `components/LongAgentSettingsPanel.tsx`（分组标题、`data-la-interaction-harness`、`data-la-agent-memory`） |
| 区域构成展示 | `components/LongAgentSettingsPanel.tsx`（`data-la-harness-revision`、`data-la-prompt-regions`）、`lib/chat-workflows-browser.ts`（解析 `prompt.regions`） |

## 6. 验收（已回写）

| 项 | 证据 |
|---|---|
| 三要素 URL 与事实优先 | `lib/initial-navigation.test.mjs`（含旧链接兼容）；`lib/long-agents-browser.test.mjs`（打开路径断言） |
| 分组与可解释 | `lib/long-agent-group-browser.test.mjs`（分组、两个开关、revision、区域列表） |
| 后端区域构成 | `test/long-agents/prompt-regions.test.mjs`；真机 `chat_interaction_harness 19,612 字符 / sha256:9da24e85…` |

**未验证**：窄屏下分组标题与区域列表的实际观感（未做移动端适配，属任务范围外）。
