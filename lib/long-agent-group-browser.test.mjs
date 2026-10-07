import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deleteLongAgentMemory,
  fetchLongAgentGroup,
  fetchLongAgentMemory,
  isSafeAgentGroupPath,
  isSafeAgentMemoryPath,
  parseLongAgentGroupDocument,
  parseLongAgentMemoryList,
  readLongAgentMemory,
  saveLongAgentGroup,
  searchLongAgentMemory,
  writeLongAgentMemory,
} from "./long-agent-group-browser.ts";

const GROUP_REVISION = `sha256:${"a".repeat(64)}`;
const INDEX_REVISION = `sha256:${"b".repeat(64)}`;
const DEFINITION_REVISION = `sha256:${"c".repeat(64)}`;
const FILE_REVISION = `sha256:${"d".repeat(64)}`;

const groupDocument = {
  schemaVersion: 1,
  stale: false,
  fetchedAt: "2026-09-06T08:00:00.000Z",
  group: {
    id: "agent-group-nexus",
    name: "Nexus runtime identity",
    standingInstructions: "Keep the durable plan current.",
    revision: GROUP_REVISION,
  },
  workspace: { folder: "team/nexus", memoryFileCount: 3 },
  coreMemory: {
    index: {
      path: "index.md", content: "# Index", size: 7,
      updatedAt: "2026-09-06T08:00:00.000Z", revision: INDEX_REVISION,
    },
    definition: {
      path: "system/definition.md", content: "# Definition", size: 12,
      updatedAt: "2026-09-06T08:00:00.000Z", revision: DEFINITION_REVISION,
    },
  },
};

const memoryList = {
  schemaVersion: 1,
  stale: false,
  agentGroupId: "agent-group-nexus",
  files: [{
    path: "notes/roadmap.md",
    size: 42,
    updatedAt: "2026-09-06T08:01:00.000Z",
    revision: FILE_REVISION,
  }],
};

const memoryRead = {
  schemaVersion: 1,
  stale: false,
  agentGroupId: "agent-group-nexus",
  file: { ...memoryList.files[0], content: "# Roadmap" },
};

test("Agent Group contract parses the exact safe NanoClaw projection", () => {
  const parsed = parseLongAgentGroupDocument(groupDocument);
  assert.equal(parsed.group.name, "Nexus runtime identity");
  assert.equal(parsed.workspace.folder, "team/nexus");
  assert.equal(parsed.coreMemory.definition.size, 12);
  assert.deepEqual(parseLongAgentMemoryList(memoryList).files.map((file) => file.path), ["notes/roadmap.md"]);
});

test("Agent Group contract rejects absolute, traversal, and malformed fields", () => {
  assert.equal(isSafeAgentGroupPath("notes/topic.md"), true);
  assert.equal(isSafeAgentGroupPath("/Users/private/memory.md"), false);
  assert.equal(isSafeAgentGroupPath("notes/../private.md"), false);
  assert.equal(isSafeAgentGroupPath("C:/private.md"), false);
  assert.equal(isSafeAgentMemoryPath("notes/topic.md"), true);
  assert.equal(isSafeAgentMemoryPath("notes/topic.txt"), false);

  assert.throws(() => parseLongAgentGroupDocument({
    ...groupDocument,
    workspace: { ...groupDocument.workspace, folder: "/srv/nanoclaw/groups/nexus" },
  }), /无效的Agent Group配置/);
  assert.throws(() => parseLongAgentMemoryList({
    ...memoryList,
    files: [{ ...memoryList.files[0], path: "../outside.md" }],
  }), /无效的Agent Memory文件摘要/);
  assert.throws(() => parseLongAgentGroupDocument({
    ...groupDocument,
    provider: "must-not-enter-browser-contract",
  }), /未知字段/);
  assert.throws(() => parseLongAgentGroupDocument({
    ...groupDocument,
    coreMemory: {
      ...groupDocument.coreMemory,
      index: { ...groupDocument.coreMemory.index, path: "notes/not-the-index.md" },
    },
  }), /无效的Agent Memory index/);
  assert.throws(() => parseLongAgentMemoryList({
    ...memoryList,
    files: [{ ...memoryList.files[0], path: "notes/plain.txt" }],
  }), /无效的Agent Memory文件摘要/);
  assert.throws(() => parseLongAgentGroupDocument({
    ...groupDocument,
    group: { ...groupDocument.group, revision: "not-a-content-revision" },
  }), /无效的Agent Group revision/);
  assert.throws(() => parseLongAgentMemoryList({
    ...memoryList,
    files: [{ ...memoryList.files[0], internalPath: "/private/memory.md" }],
  }), /未知字段/);
  assert.throws(() => parseLongAgentMemoryList({
    ...memoryList,
    files: [{ ...memoryList.files[0], updatedAt: "September 6, 2026" }],
  }), /无效的Agent Memory文件摘要/);
});

test("Agent Group and Memory browser calls use revision-protected REST operations", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    calls.push({ url: requestUrl, init });
    if (requestUrl.endsWith("/agent-group")) return Response.json(groupDocument);
    if (requestUrl.includes("operation=list")) return Response.json(memoryList);
    if (requestUrl.includes("operation=read")) return Response.json(memoryRead);
    if (requestUrl.includes("operation=search")) return Response.json({
      schemaVersion: 1,
      stale: false,
      agentGroupId: "agent-group-nexus",
      results: [{ path: "notes/roadmap.md", revision: FILE_REVISION, score: 0.91, snippet: "Roadmap" }],
    });
    const request = JSON.parse(init.body);
    if (request.operation === "write") return Response.json(memoryRead);
    if (request.operation === "delete") return Response.json({
      schemaVersion: 1, stale: false, agentGroupId: "agent-group-nexus",
      deleted: true, path: request.path,
    });
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  await fetchLongAgentGroup("nexus/primary");
  await saveLongAgentGroup("nexus/primary", GROUP_REVISION, {
    name: "Nexus", standingInstructions: null,
  });
  await fetchLongAgentMemory("nexus/primary");
  await readLongAgentMemory("nexus/primary", "notes/roadmap.md");
  await searchLongAgentMemory("nexus/primary", "road map", 12);
  await writeLongAgentMemory("nexus/primary", {
    path: "notes/roadmap.md", content: "# Roadmap", expectedRevision: FILE_REVISION,
  });
  const deleted = await deleteLongAgentMemory("nexus/primary", {
    path: "notes/roadmap.md", expectedRevision: FILE_REVISION,
  });

  assert.equal(calls[0].url, "/api/long-agents/nexus%2Fprimary/agent-group");
  assert.equal(calls[1].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    schemaVersion: 1,
    expectedRevision: GROUP_REVISION,
    name: "Nexus",
    standingInstructions: null,
  });
  assert.match(calls[2].url, /agent-memory\?operation=list$/);
  assert.match(calls[3].url, /operation=read&path=notes%2Froadmap\.md/);
  assert.match(calls[4].url, /operation=search&query=road\+map&limit=12/);
  assert.deepEqual(JSON.parse(calls[5].init.body), {
    schemaVersion: 1,
    operation: "write",
    path: "notes/roadmap.md",
    content: "# Roadmap",
    expectedRevision: FILE_REVISION,
  });
  assert.equal(deleted.deleted, true);
});

test("Agent Memory requests enforce Backend search and UTF-8 content bounds before fetch", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error("fetch must not run"); };
  await assert.rejects(searchLongAgentMemory("nexus", "x".repeat(513)), /512个字符/);
  await assert.rejects(searchLongAgentMemory("nexus", Array.from({ length: 33 }, () => "x").join(" ")), /32个分词/);
  await assert.rejects(writeLongAgentMemory("nexus", {
    path: "notes/too-large.md",
    content: "中".repeat(307_201),
    expectedRevision: null,
  }), /900 KiB/);
});

test("Long Agent settings renders separated source-owned tabs and guarded Memory actions", async () => {
  const [settings, group, memory, styles, zh] = await Promise.all([
    readFile(new URL("../components/LongAgentSettingsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LongAgentGroupSettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LongAgentMemorySettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LongAgentSettingsPanel.module.css", import.meta.url), "utf8"),
    readFile(new URL("./i18n/messages/zh-CN.ts", import.meta.url), "utf8"),
  ]);

  // P3 骨架：左侧 9 项 = 构成 5 + 能力 3 + 只读 1
  assert.match(settings, /type SettingsTab = "overview" \| "identity" \| "standards" \| "memory" \| "projects" \| "on-demand" \| "continuous" \| "channel" \| "readonly"/);
  assert.match(settings, /group: "readonly" as const/, "只读组存在");
  assert.match(settings, /activeTab === "overview"/, "概览作为右侧内容的一项");
  assert.match(settings, /data-la-actions/, "底部动作区存在");
  assert.match(settings, /data-la-bound-projects/, "项目部分含绑定项目列表");
  assert.match(settings, /data-la-interaction-harness/, "规范开关（交互 harness）在面板中");
  // 能力分组：定时任务与长期职责属于「能力 · 持续」，不与构成项平级
  assert.match(settings, /group: "capability" as const/, "存在能力分组");
  assert.match(settings, /settingsTabGroup/, "渲染分组标题");
  assert.match(settings, /id: "continuous",[\s\S]{0,200}group: "capability" as const/, "持续能力（定时任务+长期职责）归入能力");
  assert.match(settings, /id: "on-demand",[\s\S]{0,200}group: "capability" as const/, "即时能力归入能力组");
  // 可解释性：规范标签显示本轮生效 revision，并列出 prompt 区域构成
  assert.match(settings, /data-la-harness-revision/, "显示本轮 harness revision");
  assert.match(settings, /data-la-prompt-regions/, "显示 prompt 区域构成");
  // P3 总览：7 项（构成 4 + 能力 3），每项带摘要、基数（集合型）与入口
  const overview = await readFile(new URL("../components/LongAgentOverviewCard.tsx", import.meta.url), "utf8");
  assert.match(settings, /<LongAgentOverviewCard/, "设置面板渲染总览");
  for (const key of ["identity", "standards", "memory", "projects", "on-demand", "continuous", "channel"]) {
    assert.match(overview, new RegExp(`key: "${key}"`), `总览包含 ${key} 一行`);
  }
  assert.match(overview, /onOpenTab/, "总览入口可跳转");
  assert.match(overview, /countOf\(/, "复用既有集合接口取计数");
  assert.match(overview, /return undefined;/, "计数失败降级为 undefined（显示 —）");
  // 跨组件协调：概览的「进入」目标必须是骨架里真实存在的 tab（防骨架改了入口没同步）
  const settingsTabs = [...settings.matchAll(/id: "([a-z-]+)", label:/g)].map((m) => m[1]);
  const overviewTabs = [...overview.matchAll(/tab: "([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(settingsTabs.length >= 9, "骨架应有 9 项");
  for (const tab of overviewTabs) {
    assert.ok(settingsTabs.includes(tab), `概览入口 ${tab} 必须存在于 SettingsTab（实际：${settingsTabs.join(",")}）`);
  }
  // 高级配置折叠：区域构成收进 details（ConfigurationSection），默认界面只留开关与 revision
  assert.match(settings, /ConfigurationSection className=\{styles\.disclosure\} data-la-prompt-regions/, "区域构成折叠展示");
  assert.match(settings, /data-la-agent-memory/, "记忆注入开关在面板中");
  assert.doesNotMatch(settings, /id: "(?:deliverables|activity|conversations|topics|agent-group)"/);
  assert.match(settings, /LongAgentDutiesSettings/);
  // P3: temporary config renders in the shared SurfaceDialog; Radix owns focus + Escape.
  assert.match(settings, /<SurfaceDialog/);
  assert.doesNotMatch(settings, /createPortal\([\s\S]*window\.document\.body/);
  assert.doesNotMatch(settings, /<PageHeader/);
  assert.match(settings, /role="tablist"/);
  assert.match(settings, /aria-selected=\{activeTab === tab\.id\}/);
  assert.match(settings, /<LongAgentGroupSettings longAgentId=\{document\.agent\.id\}/);
  assert.match(settings, /<LongAgentMemorySettings longAgentId=\{document\.agent\.id\}/);
  assert.match(settings, /<LongAgentWorkflowSettings/);
  assert.doesNotMatch(settings, /<ModelSelection|toggleToolAddress/);
  assert.doesNotMatch(group, /provider|codex|container|restart/i);
  assert.match(group, /document\.group\.revision/);
  assert.match(group, /document\.stale/);
  assert.match(memory, /await confirm\(t\("longAgentSettings\.memoryDeleteConfirm"/);
  assert.match(memory, /LongAgentManagementError && cause\.status === 409/);
  assert.match(memory, /isSafeAgentMemoryPath\(editor\.path\)/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.memoryWorkspace[\s\S]*grid-template-columns: 1fr/);
  assert.match(zh, /Chat 显示别名/);
  assert.match(zh, /身份与长期指令/);
});
