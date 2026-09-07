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

  assert.match(settings, /type SettingsTab = "runtime" \| "agent-group" \| "agent-memory"/);
  assert.match(settings, /role="tablist"/);
  assert.match(settings, /createPortal\([\s\S]*window\.document\.body/);
  assert.match(settings, /aria-selected=\{activeTab === tab\.id\}/);
  assert.match(settings, /<LongAgentGroupSettings longAgentId=\{document\.agent\.id\}/);
  assert.match(settings, /<LongAgentMemorySettings longAgentId=\{document\.agent\.id\}/);
  assert.match(settings, /system:tool\/agent_memory_search/);
  assert.match(settings, /system:tool\/agent_memory_read/);
  assert.match(settings, /system:tool\/agent_memory_write/);
  assert.doesNotMatch(group, /provider|codex|container|restart/i);
  assert.match(group, /document\.group\.revision/);
  assert.match(group, /document\.stale/);
  assert.match(memory, /window\.confirm\(t\("longAgentSettings\.memoryDeleteConfirm"/);
  assert.match(memory, /LongAgentManagementError && cause\.status === 409/);
  assert.match(memory, /isSafeAgentMemoryPath\(editor\.path\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.memoryWorkspace[\s\S]*grid-template-columns: 1fr/);
  assert.match(zh, /Chat 显示别名/);
  assert.match(zh, /运行身份与长期职责（NanoClaw）/);
});
