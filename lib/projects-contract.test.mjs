import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fetchChatProjects, openChatProject, parseOpenedChatProject } from "./projects-contract.ts";

const openedProject = {
  projectId: "content-lab-a1b2c3d4",
  name: "Content Lab",
  description: "Content project",
  cwd: "/workspace/content-lab",
  projectRoot: "/workspace/content-lab",
};

test("opening a directory sends that exact path and validates the Project response", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let requestedUrl = "";
  let requestedBody = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body);
    return new Response(JSON.stringify(openedProject), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  assert.deepEqual(await openChatProject("/workspace/content-lab"), openedProject);
  assert.equal(requestedUrl, "/api/projects/open");
  assert.deepEqual(JSON.parse(requestedBody), { path: "/workspace/content-lab" });
});

test("opening a Project rejects malformed and failed HTTP responses", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  assert.throws(
    () => parseOpenedChatProject({ ...openedProject, projectRoot: null }),
    /projectRoot/,
  );

  globalThis.fetch = async () => new Response(JSON.stringify({ statusMessage: "Project path is invalid" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(openChatProject("/missing"), /Project path is invalid/);
});

test("Project列表保留系统容器（供身份解析）并拒绝未知类型", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const share = {
    projectId: "longagentshare",
    cachedName: "Long Agent 共享",
    cachedDescription: "公共 Long Agent 资源共享空间",
    path: "/chat-home/workspaces/longagentshare",
    firstOpenedAt: "2026-09-05T00:00:00.000Z",
    lastOpenedAt: "2026-09-07T00:00:00.000Z",
    available: true,
    kind: "share",
  };
  const agentHome = {
    ...share,
    projectId: "nexus",
    cachedName: "Nexus",
    path: "/chat-home/long-agents/nexus/workspace",
    lastOpenedAt: "2026-09-08T00:00:00.000Z",
    kind: "agent",
  };
  const project = {
    ...share,
    projectId: "content-lab",
    cachedName: "Content Lab",
    path: "/workspace/content-lab",
    lastOpenedAt: "2026-09-06T00:00:00.000Z",
    kind: "project",
  };
  // 系统容器（共享空间与 Agent home）保留在列表中：侧栏用它们解析会话身份，
  // 是否出现在“项目选择器”由使用方按 kind 过滤。
  globalThis.fetch = async () => new Response(JSON.stringify({ projects: [project, share, agentHome] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  assert.deepEqual(
    (await fetchChatProjects()).map((entry) => entry.projectId).sort(),
    ["content-lab", "longagentshare", "nexus"],
  );

  globalThis.fetch = async () => new Response(JSON.stringify({
    projects: [{ ...project, kind: "system" }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(fetchChatProjects(), /kind/);
});

test("the browser has no Chat-specific Project fallback or legacy cwd validation path", () => {
  const appShell = fs.readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const sidebar = fs.readFileSync(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(appShell, /projectId=.*\?\?\s*["']chat["']/);
  assert.doesNotMatch(`${appShell}\n${sidebar}`, /\/api\/cwd\/validate/);
  assert.match(appShell, /openChatProject\(requestedCwd/);
  assert.match(sidebar, /openChatProject\(path\)/);
});

test("Session deep-link restore waits for the Session list before declaring it missing", () => {
  const sidebar = fs.readFileSync(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");
  assert.match(
    sidebar,
    /Auto-select cwd and restore session from URL[\s\S]*?if \(loading \|\| registeredProjects\.length === 0[\s\S]*?allSessions\.find/,
  );
});
