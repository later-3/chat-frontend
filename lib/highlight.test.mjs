import assert from "node:assert/strict";
import test from "node:test";
import { HIGHLIGHT_LANGUAGES, languageFromFilename } from "./highlight.ts";

test("languageFromFilename maps extensions to shiki grammar ids", () => {
  assert.equal(languageFromFilename("/src/AppShell.tsx"), "tsx");
  assert.equal(languageFromFilename("/lib/highlight.ts"), "typescript");
  assert.equal(languageFromFilename("main.py"), "python");
  assert.equal(languageFromFilename("C:\\repo\\pkg\\index.mjs"), "javascript");
  assert.equal(languageFromFilename("config.yml"), "yaml");
  assert.equal(languageFromFilename("Cargo.lock"), "toml");
  assert.equal(languageFromFilename("CHANGELOG.patch"), "diff");
});

test("languageFromFilename detects Dockerfile and rejects unknown extensions", () => {
  assert.equal(languageFromFilename("/repo/docker/Dockerfile"), "dockerfile");
  assert.equal(languageFromFilename("/repo/docker/Dockerfile.dev"), "dockerfile");
  assert.equal(languageFromFilename("notes.xyz"), "text");
  assert.equal(languageFromFilename("Makefile"), "text");
  assert.equal(languageFromFilename("README"), "text");
  assert.equal(languageFromFilename("archive."), "text");
});

test("languageFromFilename is case-insensitive on extensions and Dockerfile", () => {
  assert.equal(languageFromFilename("Photo.JPG"), "text");
  assert.equal(languageFromFilename("report.MD"), "markdown");
  assert.equal(languageFromFilename("docker/DOCKERFILE"), "dockerfile");
});

test("HIGHLIGHT_LANGUAGES contains only valid lowercase shiki ids", () => {
  for (const language of HIGHLIGHT_LANGUAGES) {
    assert.match(language, /^[a-z]+$/);
  }
});
