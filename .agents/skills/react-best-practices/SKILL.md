---
name: react-best-practices
description: React 性能与质量门禁（源自 Vercel react-best-practices，已适配 Chat Frontend 的 Vite SPA 栈，去除 Next/RSC 专属规则）。在编写、重构或评审 React 组件、数据获取、bundle 优化和性能修复时使用。
license: MIT
metadata:
  author: vercel-labs/agent-skills (react-best-practices, adapted for Chat Frontend)
  version: "1.1.0"
---

# React Best Practices（Chat Frontend 门禁版）

70 条规则中适用于本仓库的子集，按影响力排序。适配说明：

- 源自 [vercel-labs/agent-skills react-best-practices](https://github.com/vercel-labs/agent-skills)（MIT）。
- **本仓库是纯客户端 Vite SPA（React 19），无 SSR/RSC**：原版"Server-Side Performance"整类删除；hydration 相关规则仅保留 PWA 首屏注意事项。
- 数据获取统一走 `lib/api-client` 与既有 hooks，不引入 SWR/React Query 等第二数据层；原 `client-swr-dedup` 适配为请求去重归入 hooks 层。

## 类别与优先级

| 优先级 | 类别 | 影响 | 前缀 |
|--------|------|------|------|
| 1 | 消除瀑布 | CRITICAL | `async-` |
| 2 | Bundle 体积 | CRITICAL | `bundle-` |
| 3 | 客户端数据获取 | MEDIUM-HIGH | `client-` |
| 4 | 重渲染优化 | MEDIUM | `rerender-` |
| 5 | 渲染性能 | MEDIUM | `rendering-` |
| 6 | JavaScript 性能 | LOW-MEDIUM | `js-` |
| 7 | 高级模式 | LOW | `advanced-` |

## 1. 消除瀑布（CRITICAL）

- `async-cheap-condition-before-await` — 在 await 旗标/远程值之前先检查廉价的同步条件。
- `async-defer-await` — 把 await 移进真正用到它的分支。
- `async-parallel` — 相互独立的操作用 `Promise.all()`。
- `async-api-routes` — 前端对应模式：立即启动 promise、延迟 await（如先发请求再准备 UI）。
- `async-suspense-boundaries` — 用 Suspense 流式呈现内容。

## 2. Bundle 体积（CRITICAL）

- `bundle-barrel-imports` — 直接从实现文件导入，绕过 barrel 文件。`@tabler/icons-react` 等按图标具名导入即可，但自建 `components/ui` 桶文件若引发全量加载要拆直连。
- `bundle-analyzable-paths` — 优先静态可分析的导入路径，避免宽泛 bundle。
- `bundle-dynamic-imports` — 重组件用 `React.lazy`/动态 `import()`（替代原版的 `next/dynamic`）。项目先例：shiki（`lib/highlight.ts` 按语言懒加载）、mermaid、cytoscape。
- `bundle-defer-third-party` — 分析/日志类在 hydration 后加载。
- `bundle-conditional` — 仅在功能激活时加载模块（如设置页专属依赖）。
- `bundle-preload` — hover/focus 时预加载以提升感知速度。

## 3. 客户端数据获取（MEDIUM-HIGH）

- `client-dedup` — 全局事件监听去重（单例监听 + 分发，参考 useTheme 的 systemListening 模式）。
- `client-passive-event-listeners` — scroll 监听标记 `{ passive: true }`。
- `client-localstorage-schema` — localStorage 数据带版本并最小化（`pi-theme`、草稿、会话缓存均有 schema，新增存储键要跟随既有模式并写测试）。
- 请求去重/缓存收敛在 hooks 与 `lib/*-read-model` 层，不在组件内各自 fetch。

## 4. 重渲染优化（MEDIUM）

- `rerender-defer-reads` — 只在回调里用的 state 不要订阅（用 getter/refs）。
- `rerender-memo` — 昂贵工作提取为 memo 组件。
- `rerender-memo-with-default-value` — 默认非原始值 props 提升到模块级。
- `rerender-dependencies` — effect 依赖用原始值。
- `rerender-derived-state` — 订阅派生布尔值而非原始值。
- `rerender-derived-state-no-effect` — 渲染期派生状态，不用 effect 回写。
- `rerender-functional-setstate` — 函数式 setState 稳定回调身份。
- `rerender-lazy-state-init` — 昂贵初始值传函数给 `useState`。
- `rerender-simple-expression-in-memo` — 简单原始值不必 useMemo。
- `rerender-split-combined-hooks` — 依赖不同的 hooks 拆开。
- `rerender-move-effect-to-event` — 交互逻辑放事件处理器，不进 effect。
- `rerender-transitions` — 非紧急更新用 `startTransition`。
- `rerender-use-deferred-value` — 延迟昂贵渲染保输入响应（搜索过滤适用）。
- `rerender-use-ref-transient-values` — 高频瞬态值用 ref（滚动帧、光标位置）。
- `rerender-no-inline-components` — 不在组件内部定义组件。

## 5. 渲染性能（MEDIUM）

- `rendering-animate-svg-wrapper` — 动画加在 div 包装层，不加在 SVG 元素。
- `rendering-content-visibility` — 长列表用 `content-visibility`。
- `rendering-hoist-jsx` — 静态 JSX 提取到组件外。
- `rendering-svg-precision` — 降低 SVG 坐标精度。
- `rendering-hydration-no-flicker` — 仅 PWA 首屏相关：客户端专属数据（主题）已在 `index.html` 内联脚本处理，不要移回 React state 初始化。
- `rendering-conditional-render` — 条件渲染用三元，不用 `&&`（防 0/false 漏染）。
- `rendering-usetransition-loading` — loading 态优先 `useTransition`。
- `rendering-resource-hints` — 关键资源用 `<link rel="preload">`。
- `rendering-script-defer-async` — script 标签用 defer/async。

## 6. JavaScript 性能（LOW-MEDIUM）

- `js-batch-dom-css` — CSS 变更经 class 或 `cssText` 成组。
- `js-index-maps` — 重复查找建 Map（会话/工作流树已用此模式）。
- `js-cache-property-access` — 循环内缓存对象属性。
- `js-cache-function-results` — 模块级 Map 缓存函数结果（`lib/highlight.ts` LRU、session 指纹缓存为先例）。
- `js-combine-iterations` — 多次 filter/map 合并为一次循环。
- `js-length-check-first` — 先查长度再做昂贵比较。
- `js-early-exit` — 早返回。
- `js-hoist-regexp` — RegExp 提升到循环外（模块级常量）。
- `js-min-max-loop` — 求 min/max 用循环，不用 sort。
- `js-set-map-lookups` — O(1) 查找用 Set/Map。
- `js-tosorted-immutable` — 不可变排序用 `toSorted()`。
- `js-flatmap-filter` — 一次 `flatMap` 同时完成 map 与 filter。
- `js-request-idle-callback` — 非关键工作推迟到空闲期。

## 7. 高级模式（LOW）

- `advanced-event-handler-refs` — 事件处理器存 ref。
- `advanced-init-once` — 每次应用加载只初始化一次。
- `advanced-use-latest` — useLatest 稳定回调 ref。

## 评审门禁用法

1. 新数据流：确认没有串行瀑布（能 `Promise.all` 的并行），没有组件内重复 fetch。
2. 新依赖/重组件：确认进了懒加载 chunk（`pnpm build` 输出核对），没有进首屏 index。
3. 列表/树渲染：确认虚拟化或 `content-visibility`，key 稳定，派生状态在渲染期计算。
4. effect：依赖最小且为原始值；交互逻辑在事件处理器；无渲染期 setState 循环。
5. 高频路径（滚动、输入、轮询）：ref/节流/passive 监听到位。
