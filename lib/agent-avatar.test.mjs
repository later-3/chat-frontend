import assert from "node:assert/strict";
import test from "node:test";

import { agentAvatarHue, agentInitials } from "./agent-avatar.ts";

test("agent avatar hue is stable and bounded", () => {
  const first = agentAvatarHue("nexus");
  assert.equal(first, agentAvatarHue("nexus"));
  assert.ok(first >= 0 && first < 360);
  assert.notEqual(agentAvatarHue("nexus"), agentAvatarHue("coder-muse"));
  assert.equal(agentAvatarHue(""), 0);
});

test("agent initials prefer ASCII word letters and fall back to the first character", () => {
  assert.equal(agentInitials("Nexus"), "NE");
  assert.equal(agentInitials("Architecture Muse"), "AM");
  assert.equal(agentInitials("架构缪斯"), "架");
  assert.equal(agentInitials("  "), "A");
  assert.equal(agentInitials("x"), "X");
});
