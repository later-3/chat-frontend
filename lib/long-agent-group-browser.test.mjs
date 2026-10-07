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
  assert.match(settings, /type SettingsTab = "identity" \| "standards" \| "memory" \| "projects" \| "on-demand" \| "continuous" \| "channel" \| "readonly"/);
  assert.match(settings, /group: "readonly" as const/, "只读组存在");
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
  // P3（二次修订）：不再有“总览 / 进入按钮”，导航即配置区的 8 个部分（信息不重复、导航不自指）
  const settingsTabs = [...settings.matchAll(/id: "([a-z-]+)", label:/g)].map((m) => m[1]);
  assert.equal(settingsTabs.length, 8, "配置区应为 8 项（无总览）");
  assert.ok(!settingsTabs.includes("overview"), "不应再有总览项");
  assert.doesNotMatch(settings, /LongAgentOverviewCard/, "总览组件不再使用");
  // 入口：点头像，且不再有齿轮
  const section = await readFile(new URL("../components/ProjectLongAgentSection.tsx", import.meta.url), "utf8");
  assert.match(section, /data-long-agent-profile=/, "Agent 头像可点进入");
  assert.doesNotMatch(section, /<ToolbarAction/, "齿轮入口已移除（不再渲染 ToolbarAction）");
  // 元素级重复检查：同一行不得出现两个头像（案例 C52）
  assert.equal((section.match(/<LongAgentAvatarView/g) ?? []).length, 1,
    "每行只渲染一次头像（头像只在入口按钮里出现）");
  assert.doesNotMatch(settings, /SearchSelect/, "面板内不再有 Agent 切换");
  // P3 个人主页（A1–A5）：五区齐全 + 元素唯一性（防 C52 同类重复）
  const home = await readFile(new URL("../components/LongAgentHome.tsx", import.meta.url), "utf8");
  for (const region of ["identity", "activity", "posts", "working-on"]) {
    assert.match(home, new RegExp(`data-la-home-region="${region}"`), `个人主页包含 ${region} 区域`);
  }
  // 身份卡头像（data-la-home-avatar）唯一；A5 卡片的头像属“作者标识”，是 02-design §2.4 允许的例外
  assert.equal((home.match(/data-la-home-avatar/g) ?? []).length, 1, "身份卡头像唯一");
  assert.match(home, /data-la-home-post-avatar/, "A5 卡片头像用作者标识锚点区分");
  assert.equal((home.match(/<LongAgentAvatarView/g) ?? []).length >= 1, true, "至少渲染头像");
  // 名称标题在个人主页只出现一次（头像组件的 name 属性用于生成缩写，不计入）
  assert.equal((home.match(/<h2 className=\{styles\.name\}>/g) ?? []).length, 1, "名称标题只出现一次");
  assert.match(settings, /<LongAgentHome/, "悬浮窗上半渲染个人主页");
  // P4：身份编辑（多行编辑器 + 段落列表）与规范（规则资源）
  assert.match(settings, /data-la-identity-prompt/, "身份指令编辑区存在");
  assert.match(settings, /data-la-custom-instructions/, "自定义指令段落列表存在");
  assert.match(settings, /data-la-rule-resources/, "规则资源列表存在");
  assert.match(settings, /customInstructions: readonly string\[\]/, "自定义指令按段落数组维护");
  assert.doesNotMatch(settings, /customInstructionsText/, "旧的拼接文本字段已移除");
  // P5：记忆摘要层 + 项目绑定计数/不可用标注（不重建既有能力）
  const memorySettings = await readFile(new URL("../components/LongAgentMemorySettings.tsx", import.meta.url), "utf8");
  assert.match(memorySettings, /data-agent-memory-summary/, "记忆部分有摘要层");
  assert.match(memorySettings, /fetchLongAgentMemory/, "复用既有记忆接口");
  assert.match(settings, /data-la-bound-projects/, "项目绑定列表存在");
  assert.match(settings, /longAgentSettings\.boundCount/, "绑定列表显示计数");
  assert.match(settings, /longAgentSettings\.projectUnavailable/, "不可用项目有标注");
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
