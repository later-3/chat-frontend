import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  fetchChatModelsConfig,
  parseChatModelsConfigDocument,
  saveChatModelsConfig,
} from "./models-config-browser.ts";

const validDocument = {
  schemaVersion: 1,
  source: { kind: "chat-home", path: "/tmp/chat-home/agent/models.json" },
  config: {
    providers: {
      local: {
        api: "openai-completions",
        models: [{ id: "local-model", reasoning: false }],
      },
    },
  },
  capabilities: {
    thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
    modelApis: ["openai-completions", "anthropic-messages"],
  },
};

test("Chat models configuration document validates its source and editable model fields", () => {
  assert.equal(parseChatModelsConfigDocument(validDocument).source.kind, "chat-home");
  assert.throws(
    () => parseChatModelsConfigDocument({ ...validDocument, source: { kind: "pi-agent", path: "/tmp/models.json" } }),
    /模型配置文档/,
  );
  assert.throws(
    () => parseChatModelsConfigDocument({
      ...validDocument,
      config: { providers: { local: { models: [{ id: 42 }] } } },
    }),
    /models\[0\]/,
  );
  assert.throws(
    () => parseChatModelsConfigDocument({ ...validDocument, capabilities: { thinkingLevels: [], modelApis: "x" } }),
    /capabilities/,
  );
});

test("Chat models configuration uses the Backend read and replace contract", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(validDocument), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await fetchChatModelsConfig();
  await saveChatModelsConfig(validDocument.config);
  assert.deepEqual(calls.map((call) => `${call.init?.method ?? "GET"} ${call.url}`), [
    "GET /api/models-config",
    "PUT /api/models-config",
  ]);
  assert.match(calls[1].init.body, /local-model/);
  assert.equal(calls[1].init.credentials, "same-origin");
});

test("Models panel shows the Chat-provided path instead of Pi's default path", async () => {
  const source = await readFile(new URL("../components/ModelsConfig.tsx", import.meta.url), "utf8");
  assert.match(source, /modelsConfigPath/);
  assert.doesNotMatch(source, /~\/\.pi\/agent\/models\.json/);
});
