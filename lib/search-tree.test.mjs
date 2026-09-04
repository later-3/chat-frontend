import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchTree } from "./search-tree.ts";

function names(nodes) {
  return nodes.map((node) => node.name);
}

test("groups matching paths into directories with root files", () => {
  const tree = buildSearchTree([
    "components/FileExplorer.tsx",
    "components/SessionSidebar.tsx",
    "lib/paths.ts",
    "README.md",
  ]);
  assert.deepEqual(names(tree), ["components", "lib", "README.md"]);
  assert.deepEqual(names(tree[0].children), ["FileExplorer.tsx", "SessionSidebar.tsx"]);
  assert.equal(tree[0].children[0].path, "components/FileExplorer.tsx");
});

test("sorts directories first at every depth and deduplicates paths", () => {
  const tree = buildSearchTree([
    "z.txt",
    "a/b/c.ts",
    "a/b/d.ts",
    "a/a.ts",
    "a/b/c.ts",
  ]);
  assert.deepEqual(names(tree), ["a", "z.txt"]);
  assert.deepEqual(names(tree[0].children), ["b", "a.ts"]);
  assert.deepEqual(names(tree[0].children[0].children), ["c.ts", "d.ts"]);
});

test("handles empty input and a lone root file", () => {
  assert.deepEqual(buildSearchTree([]), []);
  assert.deepEqual(buildSearchTree(["single.txt"]), [{
    name: "single.txt",
    path: "single.txt",
    isDir: false,
    children: [],
  }]);
});
