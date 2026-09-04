import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { openChatProject, parseOpenedChatProject } from "./projects-contract.ts";

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
