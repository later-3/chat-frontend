import assert from "node:assert/strict";
import test from "node:test";
import { workspaceViewFromUrl, workspaceViewUrl } from "./workspace-view.ts";

test("Moments keeps the current Session and Project when entering and leaving", () => {
  const original = "https://chat.example/?session=s1&projectId=demo#reply";
  const moments = workspaceViewUrl(original, "moments");
  assert.equal(moments, "/?session=s1&projectId=demo&view=moments#reply");
  assert.equal(workspaceViewFromUrl(new URL(moments, original).href), "moments");
  assert.equal(workspaceViewUrl(new URL(moments, original).href, "chat"), "/?session=s1&projectId=demo#reply");
});

test("direct Moments entry does not require a selected Project or Session", () => {
  assert.equal(workspaceViewFromUrl("https://chat.example/?view=moments"), "moments");
  assert.equal(workspaceViewUrl("https://chat.example/?view=moments", "chat"), "/");
  assert.equal(workspaceViewFromUrl("https://chat.example/?view=unknown"), "chat");
});

test("an async Session URL update can retain the current reading view", () => {
  const current = "https://chat.example/?view=moments";
  assert.equal(workspaceViewUrl("https://chat.example/?session=new-session", workspaceViewFromUrl(current)), "/?session=new-session&view=moments");
});
