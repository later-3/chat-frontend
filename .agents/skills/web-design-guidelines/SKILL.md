---
name: web-design-guidelines
description: Chat Frontend UI 质量门禁（源自 Vercel web-interface-guidelines，已适配 Vite SPA + CSS Modules 栈）。在编写、修改或评审任何页面、组件、样式和交互时使用：焦点环、键盘可达、触摸目标、loading 状态、动效、表单、性能预算、阴影与边框等 100+ 条验收标准。
license: MIT
metadata:
  author: vercel-labs/web-interface-guidelines (adapted for Chat Frontend)
  version: "1.1.0"
---

# Web Interface Guidelines（Chat Frontend 门禁版）

界面是由成百上千个细节决定成败的。这是编写、生成与评审 UI 时的验收清单。适配说明：

- 源自 [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)（MIT），去除 Next.js/nuqs 专属表述，映射到本仓库的 Vite SPA + CSS Modules + Radix + sonner 栈。
- 本 skill 是[ui-ux-guidelines.md](../../../docs/ui-ux-guidelines.md)的门禁补充：规范文档定义"我们长什么样"，本清单定义"交互质量是否达标"。冲突时以规范文档为准。

## 适用时机

- 新写或修改任何组件、页面、弹层、表单、动效
- 评审 AI 生成的 UI 代码
- 排查"能用但难用"的交互问题

## 交互

- **键盘全程可达。** 所有流程可用键盘完成，遵循 [WAI-ARIA Authoring Patterns](https://www.w3.org/WAI/ARIA/apg/patterns/)。弹层用 Radix 原语或复用 `useDialogFocus`，不要手写半套焦点管理。
- **清晰焦点。** 每个可聚焦元素显示可见、不被遮挡的焦点环。优先 `:focus-visible`；分组控件用 `:focus-within`。粘性头部/底部/覆盖层永不遮挡焦点元素。本项目全局焦点环已收敛到 `src/styles.css` 的 Design precision baseline 区块（`--focus-ring`），组件内不要再自定义焦点样式。
- **管理焦点。** 弹层打开移入、关闭归还焦点；焦点陷阱遵循 WAI-ARIA。
- **视觉目标与命中目标一致。** 视觉目标 < 24px 时把命中区扩到 ≥ 24px；移动端最小 44px。
- **移动端输入字号。** `<input>` 在移动端字号 ≥ 16px，避免 iOS Safari 聚焦时自动缩放。
- **尊重缩放。** 永不禁用浏览器缩放。
- **输入不被打断。** hydration/重渲染不得丢失输入焦点或值。
- **不阻止粘贴。** 永不在 `<input>`/`<textarea>` 禁用 paste。
- **加载按钮。** 显示 loading 指示并保留原始 label；提交期间禁用，请求携带幂等键。
- **loading 最短显示时长。** spinner/skeleton 加约 150–300ms 显示延迟和约 300–500ms 最短可见时长，避免快速响应时的闪烁。
- **URL 即状态。** 会话、文件路径、视图切换已用 URL 持久化；新增可分享/可回退的状态优先写入 URL（本项目模式：`router.replace` + `URLSearchParams`），不要只存 React state。
- **乐观更新。** 成功可能性高时立即更新 UI，失败时回滚并提示或提供撤销。
- **省略号表示后续。** 打开后续流程的菜单项（"重命名…"）与进行中状态（"保存中…"）以省略号结尾。
- **确认破坏性操作。** 要求确认或提供安全窗口内的撤销。
- **防止双击缩放。** 控件设置 `touch-action: manipulation`。
- **过滚动有意图。** 弹层/抽屉内设置 `overscroll-behavior: contain`。
- **滚动位置可恢复。** Back/Forward 恢复先前滚动位置。
- **桌面 autofocus 谨慎用。** 单主输入的桌面屏可 autofocus；移动端慎用（键盘弹起导致布局位移）。
- **无死区。** 看起来可交互的部分必须可交互。
- **深链一切。** 过滤、标签页、分页、展开面板——凡是用了 `useState` 的可分享状态都考虑深链。
- **拖拽干净。** 拖拽中禁用文本选择并施加 `inert`。
- **手势有替代。** 每个拖拽/滑动/捏合都可经点按控件与键盘完成。
- **链接就是链接。** 导航用 `<a>`（本项目内部导航用 router），保留 Cmd/Ctrl+Click、中键、右键行为；不用 `<button>`/`<div>` 冒充链接。
- **播报异步更新。** toast 与行内校验使用 polite `aria-live`。toast 统一走 sonner（`components/ui/FeedbackToaster.tsx`），不要新增第二套通知机制。
- **快捷键考虑布局。** 为非 QWERTY 布局着想；图标按平台显示（⌘/Ctrl）。全局快捷键注册进 `useKeyboardShortcuts`/AppShell 的统一监听，不要散落组件内。

## 动效

- **尊重 `prefers-reduced-motion`。** 提供减弱动效变体（本项目约定：入场动画包裹在 `@media (prefers-reduced-motion: no-preference)` 中）。
- **实现优先级。** CSS > Web Animations API > JS 库；避免主线程 JS 驱动动画。
- **合成器友好。** 只动画 `transform`、`opacity`；避免 `width`、`height`、`top`、`left`。
- **有必要才动。** 动画只为澄清因果或刻意的愉悦感。
- **缓动匹配对象。** 按变化的性质（尺寸、距离、触发源）选择缓动。
- **可中断。** 用户输入可取消进行中的动画。
- **变换原点正确。** 运动锚定在其"物理"起点。
- **永不 `transition: all`。** 显式列出要动画的属性（通常是 `opacity`、`transform`）。`all` 会意外动画布局属性导致卡顿。
- **SVG 变换跨浏览器。** 把 CSS 变换应用到 `<g>` 包装并设置 `transform-box: fill-box; transform-origin: center;`。

## 布局

- **光学对齐。** 感知胜过几何时 ±1px 微调。
- **刻意对齐。** 每个元素都刻意对齐到网格、基线、边缘或光学中心；不存在"随手放"的位置。
- **响应式全覆盖。** 手机、笔记本、超宽屏都验证；本项目还需覆盖 PWA 竖屏与 safe-area（`--safe-area-*` token）。
- **尊重安全区。** 用 `env(safe-area-inset-*)` 处理刘海与手势条。
- **不产生多余滚动条。** 修好 overflow，避免意外滚动条。
- **滚动容器唯一。** 一个视图内只允许**一个主滚动容器**；禁止“父容器 `overflow:hidden` + 子容器局部小滚动”的硬挤结构（案例 C58：`main` 可视 110px，个人主页 710px 被裁）。
- **关键区域不得被裁切。** 内容高于可视时，必须有可滚动的祖先；用 `data-*` 标记关键区域并断言其 `hiddenByAncestor === false`。
- **小视口先测。** 至少验证 **756×469**；大屏截图看不出“局部滚动/裁切”，小窗口立刻暴露。
- **让浏览器定尺寸。** 优先 flex/grid/intrinsic 布局，避免 JS 测量；不做布局抖动（读写分离、批量处理）。

## 内容

- **行内帮助优先。** 优先行内说明，tooltip 是最后手段。
- **骨架稳定。** skeleton 与最终内容布局完全一致，避免位移。
- **页面标题准确。** `<title>` 反映当前上下文。
- **无死胡同。** 每个屏幕都有下一步或恢复路径。
- **设计所有状态。** 空态、稀疏、密集、错误态都要设计。
- **弯引号。** 中文内容用「」或弯引号，不用直引号。
- **表格数字。** 对齐比较的数字用 `font-variant-numeric: tabular-nums`。
- **状态不靠颜色单打。** 加文字标签，不只靠红绿。
- **图标有名字。** 图标按钮必须有描述性 `aria-label`（i18n 双语键，不走硬编码字符串）。
- **语义先于 ARIA。** 优先原生元素（`button`、`a`、`label`、`table`），其次 `aria-*`。
- ** resilient 用户内容。** 布局能消化超短、平均与超长内容（会话名、路径、代码行都可能超长）。
- **省略号字符。** 用 `…` 而不是三个句点 `...`。
- **锚点标题留白。** 链接跳转的标题设置 `scroll-margin-top`。
- **文案可恢复。** 错误消息不只说出了什么问题，还要给出怎么解决（含动作按钮/链接）。

## 表单

- **Enter 提交。** 唯一控件时 Enter 提交；多控件时适用于最后一个控件。`<textarea>` 中 ⌘/Ctrl+Enter 提交、Enter 换行（本项目聊天输入遵循此约定）。
- **标签全覆盖。** 每个控件有 `<label>` 或等价关联。
- **label 激活。** 点击 `<label>` 聚焦关联控件。
- **提交规则。** 提交开始前保持可点；in-flight 期间禁用并显示 spinner。
- **不阻止输入。** 即使字段只接受数字也放行输入，用校验反馈纠错。
- **不预禁用提交。** 允许提交不完整表单以暴露校验反馈。
- **错误位置。** 错误显示在字段旁；提交时聚焦第一个错误。
- **autocomplete 与 name。** 设置正确的 `autocomplete` 与有意义的 `name` 以启用自动填充。
- **正确的类型与键盘。** 用对 `type` 与 `inputmode`。
- **placeholder 是示例。** 以省略号结尾，给示例值或格式模式。
- **未保存警告。** 数据可能丢失时在导航前警告（本项目草稿已持久化到 draft-store）。
- **原生 `<select>` 显式着色。** 显式设置 `background-color` 与 `color`，避免 Windows 深色模式对比度 bug。

## 性能

- **测量可靠。** 性能分析时排除扩展干扰；用 CPU/网络节流验证。
- **追踪重渲染。** 最小化重渲染并让重渲染快（配 [React Scan](https://react-scan.com/) 或 React DevTools）。
- **最小化布局工作。** 读写批处理；避免不必要的 reflow/repaint。
- **网络预算。** `POST/PATCH/DELETE` < 500ms 完成感知（本项目后端 API 有 p50/p95 预算）。
- **击键成本。** 优先非受控输入；受控循环保持便宜（大文本输入防抖）。
- **大列表虚拟化。** 用虚拟滚动或 `content-visibility: auto`（会话列表、消息列表已大量应用）。
- **图片零 CLS。** 显式尺寸并预留空间。
- **字体子集化。** 只随行用到的字符集；可变字体只保留所需轴。本项目通过 @fontsource-variable 自托管，中文回退系统字体栈，不打包 CJK webfont。
- **重活移出主线程。** 长任务交给 Web Worker 或拆分为异步分片；语法高亮已按此约定懒加载（`lib/highlight.ts`）。
- **视频优于 GIF。** 循环动画用 `<video autoplay muted loop playsinline>`。

## 设计

- **分层阴影。** 至少两层（环境光 + 直射光）。用 `--shadow-popover`/`--shadow-dialog` token，不要在组件内自造阴影。
- **清晰边框。** 边框与阴影组合；半透明边框改善边缘清晰度（token 体系中的 `--border-*`）。
- **嵌套圆角。** 子圆角 ≤ 父圆角且同心，曲线对齐。
- **色相一致。** 非中性背景上，边框/阴影/文本向同一色相偏色。
- **最小对比度。** 优先 APCA 口径核对感知对比度。
- **交互态提升对比。** `:hover`/`:active`/`:focus` 对比度高于静息态。
- **浏览器 UI 匹配背景。** 设置 `<meta name="theme-color">` 并维护 `color-scheme`（已在 styles.css 的 Design precision baseline 收敛）。
- **不靠渐变遮罩收尾。** 深色渐隐注意 banding，可用背景图替代。

## 评审门禁用法

生成或修改 UI 后，按以下顺序自查（不通过则修改后再交付）：

1. 键盘-only 走完一遍流程：Tab 顺序、焦点环、Escape 关闭、焦点归还。
2. 检查所有异步路径有 loading 态且不闪烁；错误可恢复。
3. 检查 `transition` 无 `all`、动画属性只有 `transform/opacity`、入场动画有 reduced-motion 变体。
4. 检查图标按钮有 `aria-label`（i18n 双语键）、语义元素优先。
5. 检查视觉 token：阴影/圆角/焦点环/选区色均来自 `src/styles.css`，无组件内自造。
6. 移动端：命中目标 ≥ 44px、输入字号 ≥ 16px、safe-area 生效。
7. **布局体检**：跑 `node scripts/ui-layout-audit.mjs "<URL>" "<打开选择器>"`，确认滚动容器唯一、关键区域未被裁切、无横向溢出、小视口可用。
8. **元素盘点**：统计关键元素出现次数（头像/标题/主按钮/徽标/状态点），确认与设计一致（案例 C52/C49：同屏重复元素）。
