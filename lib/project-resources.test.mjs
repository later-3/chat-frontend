import assert from "node:assert/strict";
import test from "node:test";

import { fetchProjectResourceCatalog } from "./project-resources.ts";

test("project resource catalog validates skills, extensions and plugins", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).startsWith("/api/skills?")) {
      return Response.json({ skills: [{
        name: "project-review",
        description: "Review a project",
        filePath: "/repo/.chat/skills/project-review/SKILL.md",
        address: "project:skill/project-review",
      }], diagnostics: [] });
    }
    if (String(url).startsWith("/api/extensions?")) {
      return Response.json({ extensions: [{
        name: "review",
        path: "/repo/.chat/extensions/review/index.ts",
        source: "project",
        scope: "project",
        origin: "file",
        enabled: true,
      }] });
    }
    return Response.json({ packages: [{
      source: "git:https://example.com/plugin.git",
      scope: "global",
      status: "loaded",
      counts: { skills: 2, extensions: 1, prompts: 0 },
    }], totals: { extensions: 1, skills: 2, prompts: 0, themes: 0 }, diagnostics: [] });
  };

  const catalog = await fetchProjectResourceCatalog("daily");
  assert.deepEqual(catalog.skills[0].name, "project-review");
  assert.deepEqual(catalog.extensions[0].path, "/repo/.chat/extensions/review/index.ts");
  assert.deepEqual(catalog.plugins[0], {
    source: "git:https://example.com/plugin.git",
    scope: "global",
    status: "loaded",
    skills: 2,
    extensions: 1,
    prompts: 0,
  });
  assert.deepEqual(calls.map((url) => url.split("?")[0]), [
    "/api/skills",
    "/api/extensions",
    "/api/plugins",
  ]);

  globalThis.fetch = async () => Response.json({ skills: "broken" }, { status: 200 });
  await assert.rejects(fetchProjectResourceCatalog("daily"), /Skill目录/);
});
