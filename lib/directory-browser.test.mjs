import assert from "node:assert/strict";
import test from "node:test";

import { browseDirectories } from "./directory-browser.ts";

test("directory browsing validates the Backend response and never renders boolean error flags", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => Response.json({
    path: "/tmp/project",
    parentPath: "/tmp",
    directories: [{ name: "src", path: "/tmp/project/src" }],
  });
  const result = await browseDirectories("/tmp/project");
  assert.equal(result.path, "/tmp/project");
  assert.equal(result.parentPath, "/tmp");
  assert.deepEqual(result.directories, [{ name: "src", path: "/tmp/project/src" }]);
  assert.equal(result.drives, null);

  // h3 error bodies use boolean `error: true`; only string fields are displayable.
  globalThis.fetch = async () => Response.json(
    { error: true, statusMessage: "目录不存在" },
    { status: 404 },
  );
  await assert.rejects(browseDirectories("/missing"), (error) => {
    assert.equal(error.message, "目录不存在");
    return true;
  });

  globalThis.fetch = async () => Response.json({ path: 1 }, { status: 200 });
  await assert.rejects(browseDirectories("/tmp"), /无效的目录浏览结果/);
});
