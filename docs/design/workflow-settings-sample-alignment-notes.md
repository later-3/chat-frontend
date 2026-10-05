# 工作流配置对话框按设计样板对齐（Phase C 实施记录）

任务与入口：用户在项目会话（ChatInput，`selectionScope="session"`）或助手 Home（LongAgentWorkflowSettings，`selectionScope="default"`）打开 `WorkflowAgentConfigDialog`，为工作流节点安排模型、生成参数、指令与工具。成功 = 用户能区分"我改了哪个存储、何时生效"，并看到真实生效值与来源。离开路径：关闭对话框，未应用的会话草稿保留在 Session 状态并随下一条消息提交。

当前问题与证据：旧对话框是 runtime/resources/session/inspect 四标签平铺——模型（持久档）、会话选择、检查混在同级，用户无法从界面看出"会话覆盖 / 助手默认 / 项目默认"是三个不同存储；生成参数（Temperature/Top-P/输出预算）无表单；底部没有统一保存状态。Phase A 已提供真实合同（`AgentConfigSelection.model/thinkingLevel/generation`、`effectiveGeneration`/`generationSource`、`saveChatAgentModelConfig({generation})`），Phase B 已落 7 套预设 token。设计样板 `docs/design-previews/workflow-settings/` 已获用户批准为布局事实源。

## 信息清单

| 信息 | 来源 | 读/写 | 保存范围与语义 | 界面位置 |
| --- | --- | --- | --- | --- |
| 配置范围（当前会话/助手默认/项目默认） | 入口 prop + 用户切换 | 读写（仅切换） | 决定下面各字段绑定哪个存储 | 顶部范围选择 |
| 范围说明 | 常量 + 入口 | 只读 | — | 范围选择旁 caption |
| 工作流、节点次序/类型 | Workflow summary | 只读 | — | 左侧节点导航 |
| 模型 / Thinking | 模型目录 + inspection | 会话/助手档写 `configs`；项目档写 model-config API | 会话：随下一条消息；助手：config-file 即时保存；项目：durable 即时保存 | 模型与生成 |
| 生成参数（temperature/topP/maxOutputTokens） | inspection.effectiveGeneration/durableConfig.generation + `configs` | 同上三档 | 空值 = 继承；清除 = 会话删字段 / 项目传 `null` | 模型与生成 |
| 模型能力（图片输入/上下文/输出上限） | `fetchChatModelCatalog` | 只读 | — | 模型选择下方 |
| 基础指令与来源 | `inspection.prompt.base` | 只读 | — | 指令与输出 |
| 规则/经验选择、配置文件路径 | `configs[agent.id]`（可编辑档） | 读写 | 会话随消息 / 助手 config-file | 指令与输出 |
| 生效值与来源链 | `inspection.agent.effective*` + sources | 只读 | 不能前端再算 | eye 面板 + effective-summary |
| 工具/技能/扩展/插件 | durable tools/resources API + catalog | 读写（durable 即时保存） | 项目档 | 工具与资源 |

## 关系推导

| 关系 | 表达 | 原因 |
| --- | --- | --- |
| 三个存储互不覆盖（selection → configs；config-file → configs；durable → model-config API） | 顶部范围三档；切换保留各档草稿 | 同一字段在三个作用域各有值，平铺会让人误以为只有一个值 |
| 继承 → 显式覆盖 → 最终值 | 空输入 = 继承（placeholder 显示继承值）；effective-summary 显示最终值 + `generationSource` 等来源标签 | 用户要同时看到"我设置了什么"和"下一轮会得到什么" |
| Workflow → 有序节点 → Agent 属性 | 左侧编号节点导航 + 右侧 node-header/三标签 | 节点切换保留草稿；Task 节点不给模型表单 |
| 检查是只读诊断 | node-header eye 按钮开合 inspection 面板（复用 InspectionDetails），不再是平级标签 | 主结果（可编辑字段）在前，诊断按需展开 |
| 更改 → 生效 | editor-footer：脏点 + "N 项未应用修改"（会话档）/ "已即时保存"（其余），错误/成功 aria-live | 三档生效时机不同，必须就地说明 |
| 会话草稿可回退 | 撤销修改 = 还原本节点草稿为打开对话框时的基线 | 会话档是唯一"暂存未提交"的档；即时保存档没有可逆 API，不提供假撤销 |

范围与入口的映射（`selectionScope` 保留为入口语义）：

| 范围 | 会话入口 | 助手入口 |
| --- | --- | --- |
| 当前会话 | 可编辑 `configs`（随下一条消息提交），初始选中 | 不存在，不渲染该选项 |
| 助手默认 | 只读展示默认解析链（含来源标签；会话覆盖会以"会话选择"来源显示） | 可编辑 `configs`（保存到助手 Home config，即时），初始选中 |
| 项目默认 | durable model-config API，即时保存 | 同左 |

推导说明：助手入口的存在目的就是编辑助手默认选择（旧 UI 的"默认资源选择"标签即此数据流），因此该入口的"助手默认"必须可编辑；会话入口没有该存储的写路径，只读展示。`selectionScope` prop 决定初始档与 `configs` 的归属。

## 参考与取舍

- 样板 `app.jsx`/`style.css`/`appearance.css`：三档范围、node-header、tabbar、parameter-grid/number-wrap、effective-summary、editor-footer、resource-row/switch 全部照搬布局细节；间距圆角取样板值，颜色一律消费 7 套预设 token（不写死色值）。
- 不进生产：模拟保存失败开关、preview-footnote、SharedModel 子页、按模型禁用采样的假能力位（真实合同中所有模型都可携带 generation 参数，由 provider 决定行为）。
- ModelPicker 用现有 `ModelSelection`（已接模型目录与能力展示），不引入 cmdk；thinking 用 `ThinkingSelection`，levels 来自所选模型。
- customInstructions 无会话级编辑合同，不做假编辑框；追加段落以 `prompt.append` + sources 只读展示。

## 实施映射

- `WorkflowAgentConfigDialog.tsx`：`ConfigScope` 三档 + `CONFIG_TABS`（model/prompt/tools）；`GenerationConfigSection`（受控三输入，空=继承，边界同 `parseGenerationConfig`，错误上抛 footer）；`ModelConfigSection` 增加 durable generation；会话/助手可编辑档共用 selection 绑定组件；footer 基线快照支持撤销/应用（应用 = `parseAgentConfigSelection` 校验 + 基线更新 + 成功提示）。
- `workflow-settings.css`：scope-picker/node-header/inspection-panel/parameter-grid/effective-summary/editor-footer/resource-rows（switch、计数徽标、有限滚动）。
- i18n：`workflowSettings.*` 新键，zh-CN/en 同步；`MODEL_SOURCE_LABELS` 补 `"selection"`。
- 测试：`chat-workflows-browser.test.mjs` 增加 generation 往返（`parseAgentConfigSelection`）、durable generation PUT/清空请求体断言、三档互不覆盖源码断言。

## 验收

- typecheck 0 错误；`pnpm test` 全绿：295 通过 / 0 失败（基线 292 + 新增 3：generation 往返、durable generation 请求体、三档互不覆盖）；`git diff --check` 干净（frontend 与父仓库）。
- 既有源码断言（skills/tools、durable model controls、promptResources 自动发现）全部保持通过。
- 三档切换保留各自数据；会话档刷新后由 Session 恢复（既有 configs 流）；项目档即时保存后 inspection 生效值与来源更新。
- 生成参数越界在 footer 报错；恢复继承清空三字段；撤销/应用按基线工作。
- 方向键切标签（roving tabindex）、eye 面板 Escape 由 SurfaceDialog 合同承载；窄屏单列。
- 实际浏览器逐主题截图验收归入 Phase D 端到端验证（本阶段以自动化门禁 + 结构对齐为准）。

## 修订

- inspection 在会话入口始终携带会话选择（既有行为），只读"助手默认"档展示的是含会话覆盖的解析链；以来源标签（含新增"会话选择"）保证不冒充默认值。不为此引入第二个检查请求。
- 工具与资源标签在所有范围下展示 durable 段（数据流不变），会话/助手档的资源覆盖字段集仅在该档可编辑时出现。
- i18n 守卫测试拦截 JSX 字面量：`Temperature`/`Top-P` 参数标签入 i18n（两语言同值）；输入框内计量单位后缀 `tokens` 依守卫注释的"计量单位保持原样"类别加入允许清单，未放宽其他规则。
