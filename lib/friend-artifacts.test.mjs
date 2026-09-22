import assert from "node:assert/strict";
import test from "node:test";
import { parseFriendArtifacts } from "./friend-artifacts.ts";

const artifact = {
  id: "art-" + "a".repeat(32), artifactKey: "b".repeat(48), longAgentId: "friend",
  kind: "note", slot: "night-note", date: "2026-09-20", taskId: "task-1", occurrenceId: "occ-1",
  workId: "work-1", dutyId: "duty-1", goalRevision: 2, progressEntryId: "prog-1",
  state: "committed", revision: 1, contentHash: "c".repeat(64), content: "笔记正文",
  target: { kind: "file", path: "notes/night.md" }, resourceId: "/tmp/notes/night.md",
  notePath: "notes/night.md", audience: null, provenance: { materials: ["materials/a.md"] },
  attempts: 1, retryable: true, failure: null, createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:01:00.000Z",
  revisions: [{ revision: 1, contentHash: "c".repeat(64), content: "笔记正文", at: "2026-09-20T10:00:00.000Z", resourceId: "/tmp/notes/night.md" }],
};
test("LA4 artifact parser accepts a verified document and rejects foreign or malformed data", () => {
  const parsed = parseFriendArtifacts({ schemaVersion: 1, longAgentId: "friend", pending: 0, artifacts: [artifact] }, "friend");
  assert.equal(parsed.artifacts.length, 1);
  assert.equal(parsed.artifacts[0].notePath, "notes/night.md");
  assert.equal(parsed.artifacts[0].state, "committed");
  assert.equal(parsed.artifacts[0].retryable, true);
  const social = { ...artifact, kind: "post", target: { kind: "social", audience: "self" }, notePath: null, audience: "self" };
  assert.equal(parseFriendArtifacts({ schemaVersion: 1, longAgentId: "friend", pending: 1, artifacts: [social] }, "friend").artifacts[0].audience, "self");
  assert.throws(() => parseFriendArtifacts({ schemaVersion: 1, longAgentId: "other", pending: 0, artifacts: [] }, "friend"));
  assert.throws(() => parseFriendArtifacts({ schemaVersion: 2, longAgentId: "friend", pending: 0, artifacts: [] }, "friend"));
  assert.throws(() => parseFriendArtifacts({ schemaVersion: 1, longAgentId: "friend", pending: 0, artifacts: [{ ...artifact, state: "done" }] }, "friend"));
  assert.throws(() => parseFriendArtifacts({ schemaVersion: 1, longAgentId: "friend", pending: 0, artifacts: [{ ...artifact, extra: 1 }] }, "friend"));
  assert.throws(() => parseFriendArtifacts({ schemaVersion: 1, longAgentId: "friend", pending: 0, artifacts: [{ ...artifact, target: { kind: "unknown" } }] }, "friend"));
});

const note = {
  versionFile: "/tmp/notes/.chat-notes/night.md-1234abcd/versions/r1-cccccccc.md",
  pointerFile: "/tmp/notes/.chat-notes/night.md-1234abcd/current.json",
  workspacePath: "notes/night.md",
  workspaceHash: null,
  workspaceState: "edited",
  conflict: { source: "workspace", contentHash: "d".repeat(64), content: "我自己写的内容", preservedFile: "/tmp/notes/.chat-notes/night.md-1234abcd/user/r1-dddddddd-user.md", at: "2026-09-20T10:05:00.000Z" },
  conflictResolution: null,
};
test("LA4 note storage parser keeps versions, workspace state and conflicts", () => {
  const document = {
    schemaVersion: 1, longAgentId: "friend", pending: 0,
    artifacts: [{ ...artifact, resourceId: note.versionFile, revisions: [artifact.revisions[0], { revision: 2, contentHash: "d".repeat(64), content: "我自己写的内容", origin: "user", versionFile: note.conflict.preservedFile, at: "2026-09-20T10:05:00.000Z" }], note }],
    operationResult: { path: "/tmp/notes/night.v1.md", relativePath: "notes/night.v1.md" },
  };
  const parsed = parseFriendArtifacts(document, "friend");
  const parsedNote = parsed.artifacts[0];
  assert.equal(parsedNote.note.workspaceState, "edited");
  assert.equal(parsedNote.note.conflict.source, "workspace");
  assert.equal(parsedNote.note.conflict.content, "我自己写的内容");
  assert.equal(parsedNote.revisions[1].origin, "user");
  assert.equal(parsedNote.revisions[1].versionFile, note.conflict.preservedFile);
  assert.equal(parsed.operationResult.relativePath, "notes/night.v1.md");
  // Legacy payloads (no note, no operationResult, revisions with resourceId) still parse.
  const legacy = parseFriendArtifacts({ schemaVersion: 1, longAgentId: "friend", pending: 0, artifacts: [artifact] }, "friend");
  assert.equal(legacy.artifacts[0].note, null);
  assert.equal(legacy.operationResult, null);
  assert.equal(legacy.artifacts[0].revisions[0].origin, "generated");
  assert.equal(legacy.artifacts[0].revisions[0].versionFile, "/tmp/notes/night.md");
  assert.throws(() => parseFriendArtifacts({ ...document, operationResult: { path: "/tmp/x" } }, "friend"));
  assert.throws(() => parseFriendArtifacts({ ...document, artifacts: [{ ...document.artifacts[0], note: { ...note, workspaceState: "weird" } }] }, "friend"));
  assert.throws(() => parseFriendArtifacts({ ...document, artifacts: [{ ...document.artifacts[0], note: { ...note, conflict: { source: "workspace" } } }] }, "friend"));
});
