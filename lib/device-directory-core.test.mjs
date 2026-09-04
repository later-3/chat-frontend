import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeviceDirectory,
  isDeviceDirectoryResponse,
} from "./device-directory-core.ts";

test("device directory keeps direct navigation while removing invalid entries", () => {
  assert.deepEqual(buildDeviceDirectory({
    version: 1,
    devices: [
      { id: "server", name: "Server", url: "https://server.example.test/" },
      { id: "invalid", name: "Invalid", url: "https://server.example.test/path" },
    ],
  }, {
    id: "workstation",
    name: "Workstation",
    url: "https://workstation.example.test/",
  }, "https://workstation.example.test/"), {
    version: 1,
    currentDeviceId: "workstation",
    devices: [
      { id: "workstation", name: "Workstation", url: "https://workstation.example.test" },
      { id: "server", name: "Server", url: "https://server.example.test" },
    ],
    diagnostics: [{
      code: "invalid-device-url",
      message: "devices[1].url must be a root http(s) origin without credentials, query, or fragment",
    }],
    selectionMode: "direct",
    gatewayUrl: null,
  });
});

test("browser response validation rejects private infrastructure fields", () => {
  const response = {
    version: 1,
    currentDeviceId: "local",
    devices: [{
      id: "local",
      name: "Chat",
      url: "https://chat.example.test",
      account: "private-user",
    }],
    diagnostics: [],
    selectionMode: "direct",
    gatewayUrl: null,
  };

  assert.equal(isDeviceDirectoryResponse(response), false);
});
