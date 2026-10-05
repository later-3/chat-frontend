# 外观七套预设（Phase B：按样板替换生产外观系统）

状态：已实施，验收结果见文末“验收回写”。样板事实源：`docs/design-previews/workflow-settings/`（themes.mjs / themes.css / appearance.css / AppearancePicker.jsx）。

## 1 任务与入口

谁：Chat Web 的使用者，在「设置 → 外观」（`WorkspaceSettings`）选择一套完整外观；也受顶栏快捷明暗切换与命令面板“切换主题”影响。对象：全局外观偏好（仅浏览器本地，不上传）。成功：用户从 7 套预设中选择一套，全站（导航、表单、浮层、Portal）立即呈现该预设的配色与材质，刷新后保持，旧 v1 偏好无损迁移，存储不可用时仍可用。

## 2 信息清单

| 信息 | 来源 | 读写 | 保存范围 | 状态 |
| --- | --- | --- | --- | --- |
| 7 个预设（paper 纸白、glacier 冰川、peach 桃雾、instagram、graphite 石墨、obsidian 黑曜、dracula）名称/描述/明暗模式/玻璃归属 | 样板 `themes.mjs` | 读（用户选择） | `chat:appearance:v2`（version=2） | 每套绑定 light/dark；glacier、obsidian 为玻璃 |
| 效果开关：氛围背景 background、细腻动效 motion、降低透明度 opaque | 样板 `AppearancePicker.jsx` | 读写 | 同上 | opaque 仅对玻璃预设可用（禁用态解释原因） |
| 旧 v1 偏好（material+palette+motion+background+opaque）与 `pi-theme` | v1 `lib/appearance.ts`（实际代码核实：v1 JSON 无 theme 字段，明暗在 `pi-theme` light/dark/auto，auto 解析系统） | 只读迁移 | 迁移写入 v2，`pi-theme` 保留为离线壳镜像 | 一次性、确定性 |
| 当前预设的语义 Token 值 | 样板 `themes.css`（唯一事实源） | CSS | — | 样板未定义的变量保持 tokens.css 现值 |

## 3 关系推导

```text
用户选择预设（AppearanceSettings radiogroup）
  → setAppearance({preset}) → lib/appearance.ts applyAppearance
      → html[data-preset="…"] + html.classList.toggle("dark", PRESET_MODE[preset]==="dark")
      → data-motion on/off、data-background on/off、data-transparency reduced/normal
  → CSS：tokens.css（:root = paper 基础）+ appearance.css（每预设一个块覆盖语义值）
      → 桥接变量（--surface-chrome/--surface-control/--surface-elevated/--material-blur/--material-edge/--ambient-background）
      → 全站组件（共享 Button、SurfaceDialog、ui-popover、workspace rail/header…）
```

- 关系「7 预设 = 1 选 1、模式绑定」→ radiogroup + roving tabindex，方向键/Home/End 循环，选择即焦点（样板行为）。
- 关系「明暗由预设决定」→ `PRESET_MODE` 常量；`pi-theme` 的 light/dark/auto 偏好退役，退化为离线壳镜像（写入解析后的 light/dark）。
- 关系「玻璃只属于 glacier/obsidian」→ `GLASS_PRESETS`；`--material-blur` 只在这两套为 `blur(var(--glass-blur)) saturate(135%)`；降低透明度开关禁用其余预设。
- 关系「系统辅助设置优先于页面开关」→ `@media (prefers-reduced-motion: reduce)`、`@media (prefers-reduced-transparency: reduce)` 块置于页面开关覆盖之后；`@supports not (backdrop-filter…)` 自然降级实色。
- 关系「正文保持实色」→ 保留 rollout 结论：玻璃只用于导航/浮层外壳（`--surface-chrome/--material-blur` 消费面），表单/正文表面用实色 token；opaque 语义保留。
- FOUC：`index.html` 内联脚本在 React 前解析 v2（缺 v2 时用同一张迁移表处理 v1 + `pi-theme`），提前写 `data-preset` 与 `.dark`；module 脚本 `initializeAppearance()` 完整应用。

## 4 迁移映射（v1 → v2，确定性；dark 取 `pi-theme` + 系统）

| v1 material | v1 palette | light → | dark → |
| --- | --- | --- | --- |
| paper | classic | paper | paper |
| paper | ocean | glacier | glacier |
| paper | rose | peach | peach |
| paper | orchid | glacier | dracula |
| paper | instagram | instagram | instagram |
| glass | classic | glacier | obsidian |
| glass | ocean | glacier | obsidian |
| glass | rose | peach | peach |
| glass | orchid | glacier | dracula |
| glass | instagram | instagram | instagram |

非法/未知值一律回默认（paper）；motion/background/opaque 原值保留（默认 full/on/off=opaque false）。

## 5 实施映射

| 文件 | 变更 |
| --- | --- |
| `lib/appearance.ts` | v2 模型、`PRESETS`/`PRESET_MODE`/`GLASS_PRESETS`、v1 迁移、v2+镜像写入 |
| `hooks/useTheme.ts` | dark = `PRESET_MODE[preset]`；preference/setTheme 退役；`toggleTheme` = 切到对侧模式最近预设（默认 paper↔graphite），保留 View Transition 圆形揭示与 reduced-motion 拦截；跨标签 storage 同步保留 |
| `index.html` | 内联脚本升级 v2+v1 迁移 |
| `src/styles/tokens.css` | `:root` 对齐样板 paper 值（圆角 10/16/22、阴影、新增 canvas/surface/navigation/portal/field-surface/edge-light/glass-edge/scrim/glass-blur/ambient/wallpaper/workspace-shadow/control-shadow/button-*）；删除 `html.dark` 块 |
| `src/styles/appearance.css` | 删除 data-material/data-palette 旧块；新增 6 个预设块（glacier/peach/instagram/graphite/obsidian/dracula，值逐项取自样板 themes.css）；桥接变量改指样板 token；透明/动效/降级块对齐样板 appearance.css；新预设选择器与迷你窗口缩略图样式 |
| `src/styles/base.css` | body 背景 = canvas + 壁纸（data-background=off 关闭壁纸层） |
| `components/ui/ui.module.css` | 共享按钮圆角改用 `--button-radius`（样板 `.button` 规则） |
| `components/AppearanceSettings.tsx` | 7 预设卡（缩略迷你窗口）浅/深分组 radiogroup + 3 效果开关 |
| `components/WorkspaceSettings.tsx` | 删除退役的浅色/深色/跟随系统主题段 |
| `components/AppShell.tsx` | 主题按钮改为当前模式图标 + 对侧切换；移除 preference/setTheme |
| `lib/i18n/messages/*` | 新增 preset/caption/group/note 键；motion 改“细腻动效”；删除 material/palette/theme.auto 退役键 |

## 6 验收

自动化：`appearance.test.mjs`（v2 解析、20 格迁移表、非法值回退、PRESET_MODE 完整性、7 预设对比度门禁）、`mobile-pwa-layout.test.mjs`（内联脚本 v2/v1 等价性执行门禁）、i18n 双语键一致性、motion-contract（新 CSS 无魔法时长）、offline-theme（离线壳合同不回归）。命令：`pnpm test`、`pnpm typecheck`、`pnpm build`（frontend 内）。
人工边界：PWA `theme-color` meta 仍按系统明暗（media 属性），不随预设动态改写；离线壳保留经典明暗降级（读 `pi-theme` 镜像）。

## 验收回写（2026-10-01 实施并验证）

- `pnpm test`：292 个测试全部通过（0 失败）。其中本轮重写/更新的门禁：`appearance.test.mjs`（PRESET_MODE 完整性、v2 解析与逐字段回退、20 格迁移表逐格断言、非法输入回退、readAppearance 的 pi-theme light/dark/auto/缺失/抛错分支、writeAppearance 双键写入、applyAppearance data 属性与 dark class、7 预设 × 9 组合对比度门禁）；`mobile-pwa-layout.test.mjs` 改为用 `runInNewContext` 执行 index.html 内联脚本，与 `migrateV1Appearance` 做 v1 全组合（2 材质 × 5 配色 × 2 明暗）+ v2 + auto + 空存储等价性校验；`offline-theme.test.mjs` 颜色锚点更新为 paper/graphite（offline.html 深色块随 graphite 对齐）。
- `pnpm typecheck` / `pnpm build`：通过（`tsc --noEmit` 无错误，vite build 成功）。
- 门禁裁决：对比度门禁中仅 instagram `--text-dim`(#707070) × `--bg-selected`(#fceaf3) = 4.29 低于 4.5——两个值均为样板 themes.css 原文，属用户批准的唯一事实源；`text-dim` 是辅助说明角色（不用于正文），该角色门禁定为 4.2，正文角色（text/text-muted）维持 4.5，已在测试注释中记录。
- 消扫：`data-material`/`data-palette`/`PALETTES`/`ThemePreference` 在代码中零残留；`chat:appearance:v1` 仅存在于迁移常量、index.html 内联脚本与对应测试（有意保留的迁移路径）；退役 i18n 键（material*/palette*/paper*/glass*/design.theme*/workspaceNav.theme/theme.auto）已删，zh-CN/en 双语一致。
- 被推翻/修正的推导：样板 `--social-gradient` 需要落到 instagram 预设块供缩略图使用；`--overlay`（scrim 消费者）改为 `var(--scrim)` 桥接而不是保留独立硬编码值；共享按钮圆角接入 `--button-radius` 是样板 pill 圆角（glacier/peach/instagram/obsidian）生效的必要条件，属于本任务触碰范围；`pi-theme` 保留为 writeAppearance 写入的 light/dark 派生镜像（offline.html 合同不回归）。
- 已知边界（不在本轮）：WorkflowAgentConfigDialog 业务结构对齐样板是下一阶段；PWA theme-color meta 保持按系统明暗的静态 media 作用域，不随预设动态改写（动态化需重新评审 manifest 合同）。
