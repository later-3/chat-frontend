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

test("advanced model options preserve native fields and reject malformed HTTP data", () => {
  const withModel = model => ({ ...validDocument, config: { providers: { custom: {
    name: "Custom", authHeader: true, models: [{ id: "vision", ...model }],
  } } } });
  const model = { baseUrl: "https://example.test/v1", input: ["text", "image"], samplingParams: { temperature: 0.2 }, compat: { supportsStore: false } };
  assert.deepEqual(parseChatModelsConfigDocument(withModel(model)).config.providers.custom.models[0], { id: "vision", ...model });
  for (const malformed of [{ baseUrl: 5 }, { input: ["video"] }, { samplingParams: [] }, { samplingParams: null }]) {
    assert.throws(() => parseChatModelsConfigDocument(withModel(malformed)), /模型配置文档/);
  }
});


test("editor operations require explicit boolean capabilities; older servers expose no operations", () => {
  assert.equal(parseChatModelsConfigDocument(validDocument).capabilities.operations, undefined);
  const operations = { catalog: false, discover: false, test: false, credentials: false };
  const document = { ...validDocument, capabilities: { ...validDocument.capabilities, operations } };
  assert.deepEqual(parseChatModelsConfigDocument(document).capabilities.operations, operations);
  assert.throws(() => parseChatModelsConfigDocument({ ...document, capabilities: { ...document.capabilities,
    operations: { ...operations, test: "true" },
  } }), /capabilities.operations/);
});
