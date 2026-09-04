import assert from "node:assert/strict";
import test from "node:test";
import {
  documentPreviewKind,
  getAudioMime,
  getFileExt,
  getImageMime,
  isDocumentPreviewPath,
} from "./file-types.ts";

test("frontend preview types match the backend contract", () => {
  assert.equal(getImageMime("/tmp/screenshot.PNG"), "image/png");
  assert.equal(getAudioMime("C:\\Users\\me\\voice.OPUS"), "audio/ogg");
  assert.equal(documentPreviewKind("/tmp/report.PDF"), "pdf");
  assert.equal(isDocumentPreviewPath("/tmp/report.docx"), true);
  assert.equal(isDocumentPreviewPath("/tmp/report.txt"), false);
});

test("frontend extensions support POSIX and Windows paths", () => {
  assert.equal(getFileExt("/tmp/archive.tar.gz"), "gz");
  assert.equal(getFileExt("C:\\Users\\me\\photo.AVIF"), "avif");
});
