# 输入区与消息正文：状态色与语义面收敛

日期：2026-10-01；状态：本轮实施完成，等待视觉评审。遵循[前端设计方法](../frontend-design-method.md)，组件与交互合同以 [UI/UX 规范](../ui-ux-guidelines.md) §4.1、§18.4、§20.1、§20.4 为准。

## 1. 任务与入口

用户在一个会话里**读一轮对话**并**发下一条消息**：输入区（含队列/重试/压缩反馈）与消息正文（工具调用与输出、思考、diff、图片、失败）是两个每天都在看的功能面。离开（切换会话/刷新）后回到原会话，草稿与阅读位置保持原合同。

选中它们的理由不是"看起来旧"，而是两处可复现的规范偏差：

- 输入区的重试、压缩成功、压缩失败三条横幅用固定 `rgba()` 黄/绿/红；steer / follow-up 两个队列动作是**手写 `<button>`** + 硬编码 rgba，违反 §20.1「按钮只能由 `Button` 声明」与 §4.1「语义色不作装饰」。
- 消息正文的工具卡、工具输出顶边、diff 增删行、内联图片边框使用 `rgba(34,197,94,…)`、`rgba(248,113,113,…)`、`rgba(59,130,246,…)` 等死色；这些颜色不随配色（ocean/rose/orchid/instagram）与明暗变化，也不受"减少透明"影响。

## 2. 信息清单与关系

| 信息 | 来源 | 读/写 | 状态 |
|---|---|---|---|
| 本轮是否在重试、第几次、原因 | 运行事件 | 只读 | 进行中/失败可重试 |
| 压缩结果摘要或错误 | 维护操作 | 只读 | 成功/失败 |
| 消息正文块（思考/工具/文本） | Pi 原生 entry | 只读 | 进行中/完成/失败 |
| 工具调用与输出 | 原生 toolCall + toolResult | 只读 | pending / success / error |
| 消息内 diff（split 与 unified） | 工具结果 | 只读 | 新增/删除/上下文/hunk |
| 消息内图片 | 工具结果或用户附件 | 只读 | 可用/不可用 |

关系 → 表达：

| 关系 | 表达 | 原因 |
|---|---|---|
| 同一种"提示 + 状态"重复出现三次以上 | **一个类族** `.ui-note-inline` + `is-warning/is-success/is-danger` | §20.3：第三种实现出现即收敛 |
| 工具结果的成功/失败是**同一对象的状态**，不是两种卡片 | 同一 `.message-tool-card`，状态用 `is-success/is-error` + `data-tool-card-state` | §19：状态标运行态，类别标类别，二者不混用 |
| diff 的增删是**语义**，不是装饰 | `--diff-add-wash / --diff-remove-wash / --diff-hunk-wash` | 语义色只表达含义 |
| 队列动作有两种意图（打断当前轮 / 本轮之后） | 共享 `Button` + `Hint`；只有"打断"用 warning 角色色 | §5.1 一个主动作、次要动作归位；不靠颜色猜测 |
| 配色的可变性 | 派生 Token 用 `color-mix` 从 `--success/--warning/--danger` 计算一次 | 5 套配色 × 明暗 × 纸/玻璃自动继承，页面不重复声明 |

## 3. 实施映射

- `src/styles/tokens.css`：新增 `--success-wash/-outline`、`--warning-wash/-outline`、`--danger-wash/-outline`、`--diff-add-wash`、`--diff-remove-wash`、`--diff-hunk-wash`、`--media-outline`、`--shadow-composer`，全部由语义角色派生。
- `src/styles/components.css`：新增 `.ui-note-inline` 类族、`.message-tool-card`（含 `is-success/is-error`）、`.message-diff-*`、`.composer-queue-action`（`is-interrupt` 用 warning 角色）。
- `components/ChatInput.tsx`：三条横幅改用共享类；三个合成阴影改用 `--shadow-composer`；steer / follow-up 改为共享 `Button` + `Hint`，带 `data-composer-queue` 便于浏览器断言。
- `components/MessageView.tsx`：工具卡改为类 + `data-tool-card-state`；工具输出顶边、结果 diff 顶边、split/unified diff 底色、图片边框改为 Token；provider 错误块复用 `.ui-note-inline is-danger`。
- 门禁 `lib/semantic-surface-contract.test.mjs`：两个文件不得出现 `rgba(数字…` 或 6 位 hex；派生 Token 必须存在且由 `color-mix` 派生；共享类必须存在；工具卡状态必须可通过 `data-tool-card-state` 断言。

## 4. 实测证据（2026-10-01，隔离栈 + 本地假模型，真实浏览器）

场景：发一条会触发工具失败的消息（读取不存在的文件），展开 TurnSummary 后测量工具卡。截图与原始数据在 `.data/verification/chat-surfaces/`（`after/*.png` 四态，`after/computed-styles.txt` 为原始测量）。

| 状态 | 工具名对比度 | 预览/状态标签 | 卡片边框 | 卡片底色 |
|---|---|---|---|---|
| classic 浅色 | 12.27 | 5.40 | danger 40%（深红） | 4% danger wash |
| classic 深色 | 12.43 | 7.42 | danger 40%（浅红） | 4% danger wash |
| ocean + 玻璃 浅色 | 11.38 | 5.23 | danger 40% | 玻璃表面 + 4% wash |
| ocean + 玻璃 深色 | 12.20 | 7.63 | danger 40% | 玻璃表面 + 4% wash |

改动前的取值（源码事实，不是测量）：工具卡边框为固定 `rgba(248,113,113,0.45)`、成功为 `rgba(34,197,94,0.25)`、背景 `rgba(…,0.05)`；这些是字面量，**在任何配色与明暗下都相同**，也不随"减少透明"变化——这正是本轮要消除的。修正对比度时也发现：小字号语义色（11px 的 danger 文字）在浅色下会接近下限，所以工具名改用 `--text` 承载身份、状态交给边框与状态标签。

## 5. 验收

- 正常：工具卡 `pending → success`、diff 增删、内联图片、重试横幅、压缩成功横幅在明暗与 5 套配色下都读得清。
- 失败/竞态：工具卡 `is-error`、压缩失败横幅（`role="alert"`）、provider 错误块仍可读且与成功态可区分。
- 明暗 × 纸/玻璃：颜色来自语义 Token，玻璃只改表面，不改变状态含义。
- 键鼠：队列动作仍是按钮语义，键盘可达，`Hint` 提供说明；禁用态保留（不可排队时不明示可点）。

## 6. 修订与遗留

- 本轮只收敛"状态色与语义面"，未改信息架构；`AppShell` 的上下文占用警示色与遮罩、`BranchNavigator` 阴影属另外两个页面，记入后续批次。
- 结构类收敛（`.message-tool-card` 内层的 header/body 仍为 inline 布局）留待下一批：先把颜色与状态收口，再动布局，避免同一次改动同时改变结构与语义。
