import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deleteLongAgentAvatar,
  createChatLongAgent,
  enableChatLongAgents,
  parseCreatedLongAgent,
  fetchLongAgentConfiguration,
  fetchLongAgents,
  longAgentAvatarImageUrl,
  saveLongAgentConfiguration,
  sendLongAgentMessage,
  startProjectLongAgent,
  uploadLongAgentAvatar,
} from "./long-agents-browser.ts";

test("first-use and additional coworkers validate persisted identities without requiring a Project or Group ID", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json({ schemaVersion: 1, agent: { id: "nexus", name: "Nexus", description: "", defaultProjectId: "nexus", status: "active" } });
  });
  assert.equal((await enableChatLongAgents()).defaultProjectId, "nexus");
  await createChatLongAgent({ id: "coder", name: "Coder" });
  assert.deepEqual(calls, [
    { url: "/api/long-agents/enable", body: {} },
    { url: "/api/long-agents", body: { id: "coder", name: "Coder" } },
  ]);
  assert.throws(() => parseCreatedLongAgent({ schemaVersion: 1, agent: { id: "nexus" } }));
  const component = await readFile(new URL("../components/ProjectLongAgentSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /if \(!projectId|nanoclawAgentGroupId|instanceId: "local"/);
  assert.match(component, /longAgent\.enable/);
});

test("LongAgent browser contract validates list and message acceptance", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("/api/long-agents?")) {
      return Response.json({
        agents: [{
          id: "nexus", name: "Nexus", description: "长期 Agent", defaultProjectId: "daily",
          runtime: "pi",
          avatar: { kind: "emoji", emoji: "🦉" },
          status: "active",
          configuration: { model: null, thinkingLevel: null, toolMode: "pi-default", channelType: "telegram" },
          project: { started: true, status: "active", projectLongAgentId: "project-long-agent:daily:nexus", primarySessionId: "session-1" },
          available: true, channelHostAvailable: true, syncStatus: "ok",
        }],
        bindings: [{
          id: "binding-1", projectLongAgentId: "project-long-agent:daily:nexus", projectId: "daily", chatSessionId: "session-1", longAgentId: "nexus",
          channelType: "telegram", nanoclawSessionId: "nano-session-1",
        }],
        sync: [],
      });
    }
    if (String(url).endsWith("/start")) return Response.json({
      projectLongAgentId: "project-long-agent:daily:nexus", projectId: "daily", longAgentId: "nexus",
      primarySessionId: "session-1", status: "active", isNewSession: false,
    });
    return Response.json({
      accepted: true, completed: true, sessionId: "session-1", projectLongAgentId: "project-long-agent:daily:nexus",
      messageId: "message-1", turnId: "message-1", isNewSession: false,
      text: "reply", model: { provider: "test", modelId: "model" },
    });
  };

  const listed = await fetchLongAgents("daily");
  assert.equal(listed.agents[0].id, "nexus");
  assert.deepEqual(listed.agents[0].avatar, { kind: "emoji", emoji: "🦉" });
  assert.equal(listed.bindings[0].chatSessionId, "session-1");
  const accepted = await sendLongAgentMessage({
    longAgentId: "nexus", projectId: "daily", sessionId: "session-1", text: "hello", requestId: "stable-browser-id",
  });
  assert.equal(accepted.messageId, "message-1");
  assert.equal(accepted.completed, true);
  assert.equal(calls[1].url, "/api/long-agents/nexus/messages");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    projectId: "daily", sessionId: "session-1", text: "hello", requestId: "stable-browser-id",
  });
  const started = await startProjectLongAgent({ longAgentId: "nexus", projectId: "daily" });
  assert.equal(started.primarySessionId, "session-1");
  assert.equal(calls[2].url, "/api/long-agents/nexus/start");
});

test("LongAgent browser contract rejects malformed data", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ agents: [{ id: "broken" }], bindings: [] });
  await assert.rejects(fetchLongAgents("daily"), /无效LongAgent摘要/);
});

test("LongAgent configuration contract validates GET and sends revision-protected PUT", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  const document = {
    schemaVersion: 1,
    revision: "a".repeat(64),
    agent: {
      id: "nexus",
      name: "Nexus",
      description: "Daily coworker",
      avatar: { kind: "image", revision: 2 },
      effective: {
        model: { provider: "openai", modelId: "gpt-5" },
        thinkingLevel: "high",
        modelSource: "explicit",
        thinkingSource: "explicit",
      },
      enabled: false,
      defaultProjectId: "daily",
      definition: {
        schemaVersion: 1,
        id: "nexus",
        name: "Nexus",
        description: "Daily coworker",
        model: { provider: "openai", modelId: "gpt-5" },
        thinkingLevel: "high",
        systemPrompt: { mode: "pi-default" },
        customInstructions: [{ text: "Remember project context" }],
        tools: {
          mode: "pi-default",
          addresses: ["system:tool/memory_search", "system:tool/workflow_call"],
        },
        resources: { mode: "inherit" },
      },
    },
    channel: {
      type: "telegram",
      instance: "telegram",
      host: { id: "local", name: "Local NanoClaw", executionMode: "chat-pi" },
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json(document);
  };

  const current = await fetchLongAgentConfiguration("nexus/primary");
  assert.equal(current.agent.enabled, false);
  assert.deepEqual(current.agent.avatar, { kind: "image", revision: 2 });
  assert.deepEqual(current.agent.effective, {
    model: { provider: "openai", modelId: "gpt-5" },
    thinkingLevel: "high",
    modelSource: "explicit",
    thinkingSource: "explicit",
  });
  assert.deepEqual(current.agent.definition.customInstructions, ["Remember project context"]);
  assert.equal(calls[0].url, "/api/long-agents/nexus%2Fprimary/config");
  assert.equal(calls[0].init.credentials, "same-origin");

  const newlyCreated = structuredClone(document);
  newlyCreated.agent.description = "";
  newlyCreated.agent.definition.description = "Chat Long Agent";
  newlyCreated.channel = null;
  globalThis.fetch = async () => Response.json(newlyCreated);
  assert.equal((await fetchLongAgentConfiguration("nexus")).agent.description, "");
  newlyCreated.agent.responseTemplate = { invalid: true };
  await assert.rejects(fetchLongAgentConfiguration("nexus"), /无效Long Agent配置/);

  const stringInstructionDocument = structuredClone(document);
  stringInstructionDocument.agent.definition.customInstructions = ["Already normalized"];
  stringInstructionDocument.agent.definition.thinkingLevel = null;
  globalThis.fetch = async () => Response.json(stringInstructionDocument);
  const normalized = await fetchLongAgentConfiguration("nexus");
  assert.deepEqual(normalized.agent.definition.customInstructions, ["Already normalized"]);
  assert.equal(normalized.agent.definition.thinkingLevel, null);
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json(document);
  };

  await saveLongAgentConfiguration("nexus/primary", current.revision, {
    name: current.agent.name,
    description: current.agent.description,
    enabled: true,
    defaultProjectId: current.agent.defaultProjectId,
    definition: current.agent.definition,
  });
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(calls[1].init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    schemaVersion: 1,
    expectedRevision: "a".repeat(64),
    name: "Nexus",
    description: "Daily coworker",
    enabled: true,
    defaultProjectId: "daily",
    definition: {
      schemaVersion: 1,
      id: "nexus",
      name: "Nexus",
      description: "Daily coworker",
      model: { provider: "openai", modelId: "gpt-5" },
      thinkingLevel: "high",
      systemPrompt: { mode: "pi-default" },
      customInstructions: ["Remember project context"],
      tools: {
        mode: "pi-default",
        addresses: ["system:tool/memory_search", "system:tool/workflow_call"],
      },
      resources: { mode: "inherit" },
    },
  });
});

test("LongAgent configuration contract rejects private or malformed public documents", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    schemaVersion: 1,
    revision: "not-a-revision",
    agent: {},
    channel: { token: "must-not-reach-browser" },
  });
  await assert.rejects(fetchLongAgentConfiguration("nexus"), /无效Long Agent配置/);
});

test("LongAgent avatar upload and removal use the revision-guarded avatar contract", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const document = {
    schemaVersion: 1,
    revision: "b".repeat(64),
    agent: {
      id: "nexus",
      name: "Nexus",
      description: "Daily coworker",
      avatar: { kind: "image", revision: 3 },
      effective: { model: null, thinkingLevel: null, modelSource: null, thinkingSource: null },
      enabled: true,
      defaultProjectId: "daily",
      definition: {
        schemaVersion: 1,
        id: "nexus",
        name: "Nexus",
        description: "Daily coworker",
        systemPrompt: { mode: "pi-default" },
        customInstructions: [],
        tools: { mode: "pi-default" },
        resources: { mode: "inherit" },
      },
    },
    channel: {
      type: "telegram",
      instance: "telegram",
      host: { id: "local", name: "Local NanoClaw", executionMode: "chat-pi" },
    },
  };
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json(document);
  };

  const uploaded = await uploadLongAgentAvatar({
    longAgentId: "nexus",
    bytes: new Blob([new Uint8Array([0x89, 0x50])], { type: "image/png" }),
    expectedRevision: "a".repeat(64),
  });
  assert.deepEqual(uploaded.agent.avatar, { kind: "image", revision: 3 });
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].url, `/api/long-agents/nexus/avatar?expectedRevision=${"a".repeat(64)}`);
  assert.equal(calls[0].init.headers["Content-Type"], "image/png");
  assert.ok(calls[0].init.body instanceof Blob);

  await deleteLongAgentAvatar({ longAgentId: "nexus", expectedRevision: "b".repeat(64) });
  assert.equal(calls[1].init.method, "DELETE");
  assert.equal(calls[1].url, `/api/long-agents/nexus/avatar?expectedRevision=${"b".repeat(64)}`);

  assert.equal(longAgentAvatarImageUrl("nexus", 3), "/api/long-agents/nexus/avatar?v=3");
});

test("LongAgent configuration surfaces the Backend conflict message", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    statusMessage: "Long Agent配置已被其他操作更新，请重新加载后再保存",
    message: "less specific",
    error: "fallback",
  }, { status: 409 });
  await assert.rejects(
    fetchLongAgentConfiguration("nexus"),
    /Long Agent配置已被其他操作更新，请重新加载后再保存/,
  );
});

test("Project sidebar and execution route use server-owned Session or topic identity", async () => {
  const [section, settings, sidebar, modeStyles, chatInput, agentSession, appShell] = await Promise.all([
    readFile(new URL("../components/ProjectLongAgentSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LongAgentSettingsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SessionSidebarModes.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/ChatInput.tsx", import.meta.url), "utf8"),
    readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(sidebar, /<ProjectLongAgentSection/);
  assert.match(sidebar, /projectSessions\.filter\(\(session\) => session\.owner\.type === "ordinary"\)/);
  assert.doesNotMatch(sidebar, /longAgentPrimarySessionIds|longAgentSessionIndex|onPrimarySessionIdsChange/);
  assert.match(sidebar, /role="tablist"/);
  assert.match(sidebar, /visible=\{contentPanel === "long-agents"\}/);
  assert.match(sidebar, /contentPanel === "sessions" && <div/);
  assert.match(sidebar, /setContentPanel\("sessions"\);[\s\S]*onSelectSession\(s\)/);
  assert.match(sidebar, /filesSlot && createPortal/);
  assert.match(modeStyles, /@media \(max-width: 768px\)[\s\S]*min-height: 44px/);
  assert.match(section, /if \(!visible\) return null/);
  // 长期同事直接会话：永远落在它自己的 home 项目，而不是当前选中的项目。
  assert.match(section, /startProjectLongAgent\(\{ longAgentId: agent\.id, projectId: agent\.defaultProjectId \}\)/);
  // 长期同事身份仍只来自 Session owner；AppShell 用它派生 Friend 身份。
  assert.match(appShell, /selectedSession\?\.owner\.type === "long-agent"/);
  // LA6 A：Friend 的侧栏 cwd/项目、资源区和标题必须用该 Friend 的关联，而不是全局上下文项目。
  assert.match(appShell, /selectedProjectId=\{selectedLongAgentId !== null \? friendContextProjectId : activeProjectId\}/);
  assert.match(appShell, /const resourceProjectId = selectedLongAgentId !== null/);
  assert.match(appShell, /const titleCwd = selectedLongAgentId !== null \? friendContextCwd : activeCwd/);
  // 侧栏不把 Agent home 的 workspace 当作上下文切换上报；顶栏显示共享 Agent 空间。
  assert.match(sidebar, /if \(project\?\.kind === "agent"\) return;/);
  // LA6 A：选中 Friend 时侧栏 cwd 用其关联项目的目录，而不是全局上下文 cwd。
  assert.match(appShell, /selectedLongAgentId !== null\s*\?\s*friendContextCwd/);
  assert.match(appShell, /if \(session\.owner\?\.type !== "long-agent"\) \{\s*setContextCwd\(session\.cwd\)/);
  // 会话打开必须用 start 返回的真实项目归属，避免跨项目会话按当前项目去查。
  assert.match(section, /await onOpenSession\(started\.primarySessionId, sessionProjectId\)/);
  assert.doesNotMatch(section, /onPrimarySessionIdsChange/);
  assert.match(section, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(section, /<LongAgentSettingsPanel/);
  assert.match(section, /primarySessionId === selectedSessionId/);
  assert.match(settings, /longAgentSettings\.back/);
  assert.doesNotMatch(settings, /type=["']password["']/);
  assert.doesNotMatch(settings, /telegramToken|botToken|apiToken/i);
  assert.doesNotMatch(chatInput, /LongAgentManagerDialog/);
  assert.doesNotMatch(chatInput, /<optgroup label=\{t\("chat\.longAgents"\)\}/);
  // The composer never repeats the coworker identity; the sidebar panel owns it.
  assert.doesNotMatch(chatInput, /chat\.longAgentIdentity|chat\.longAgentCoworker/);
  assert.match(chatInput, /\{longAgentId === null && \(/);
  // Coworkers render as a social-style contact list with stable identity avatars.
  assert.match(section, /<LongAgentAvatarView/);
  assert.match(section, /data-state=\{state\}/);
  assert.match(section, /styles\.list/);
  const avatarView = await readFile(new URL("../components/LongAgentAvatar.tsx", import.meta.url), "utf8");
  assert.match(avatarView, /agentAvatarHue\(agentId\)/);
  assert.match(avatarView, /longAgentAvatarImageUrl\(agentId, avatar\.revision\)/);
  const settingsPanel = await readFile(new URL("../components/LongAgentSettingsPanel.tsx", import.meta.url), "utf8");
  assert.match(settingsPanel, /<LongAgentAvatarEditor/);
  // A newly created topic Session may have no legacy owner index yet; the server-resolved node
  // target retains the Friend identity without introducing a second mutable identity selector.
  assert.match(agentSession, /const longAgentId = topicNode\?\.longAgentId \?\? sessionLongAgentId\(session\)/);
  assert.doesNotMatch(agentSession, /setLongAgentIdState|setLongAgentId/);
  assert.match(agentSession, /longAgentId !== null && selectedLongAgent === undefined[\s\S]*return;/);
  assert.match(agentSession, /acceptFriendMessage\(selectedLongAgent\.id/);
  assert.match(agentSession, /await observeFriend\(accepted, controller\)/);
  assert.match(agentSession, /owner: \{ type: "ordinary" \}/);
  assert.match(agentSession, /session: parseSessionInfo\(body\.session\)/);
  assert.match(appShell, /fetchProjectSessionById\(projectId, sessionId\)[\s\S]*handleSelectSession\(target\)/);
  assert.match(appShell, /onSessionOpen=\{\(sessionId\) => handleOpenExistingSession\(sessionId, currentProjectId\)\}/);
  assert.match(appShell, /onSessionForked=\{handleSessionForked\}/);
  assert.doesNotMatch(appShell, /onSessionOpen=\{handleSessionForked\}/);
});

test("Friend submission preserves explicit null collaboration without changing Session storage", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ accepted: true, completed: true, sessionId: "daily-session", projectLongAgentId: "friend-binding",
      messageId: "turn", turnId: "turn", isNewSession: false, text: "ok", model: null });
  });
  await sendLongAgentMessage({ longAgentId: "friend", projectId: "friend-home", sessionId: "daily-session", contextProjectId: null, text: "hello", requestId: "same-request" });
  assert.deepEqual(body, { projectId: "friend-home", sessionId: "daily-session", contextProjectId: null, text: "hello", requestId: "same-request" });
});
