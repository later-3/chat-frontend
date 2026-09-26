import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const agentSessionSource = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
const workflowBrowserSource = await readFile(new URL("./chat-workflow-browser.ts", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
// The review card was extracted so the chat surface AND topic creation share ONE implementation.
const planReviewCardSource = await readFile(new URL("../components/PlanReviewCard.tsx", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");

test("Workflow submissions use the current Chat Session ID", () => {
  assert.match(agentSessionSource, /sessionIdRef\.current === null[\s\S]*?sessionId: sessionIdRef\.current/);
});

test("a newly accepted Run promotes its durable Session before Workflow completion", () => {
  assert.match(agentSessionSource, /sessionIdRef\.current = reference\.sessionId/);
  assert.match(agentSessionSource, /reference\.isNewSession && newSessionDraftKey !== null/);
  assert.match(agentSessionSource, /onSessionCreated\?\.\(\{[\s\S]*?id: reference\.sessionId/);
  assert.match(appShellSource, /router\.replace\(`\?session=\$\{encodeURIComponent\(session\.id\)\}`/);
});

test("Workflow completion reloads the persisted Session instead of inventing completed messages", () => {
  assert.match(agentSessionSource, /fetchSessionData\(workflow\.result\.sessionId, projectId\)/);
  assert.match(agentSessionSource, /onSessionCreated\?\.\(refreshed\.session, newSessionDraftKey\)/);
  assert.doesNotMatch(agentSessionSource, /messageCount:\s*2/);
});

test("promoting a new Session does not abort the active Workflow", () => {
  assert.match(agentSessionSource, /workflowAbortRef\.current === null && data\?\.sessionId !== session\.id/);
  assert.doesNotMatch(agentSessionSource, /\[isNew, loadSession, newSessionDraftKey, session\]/);
});

test("Agent output is retained with its Workflow and Stage provenance", () => {
  assert.match(agentSessionSource, /message\.role === "assistant" && stage\?\.agentId !== undefined[\s\S]*?chatWorkflow/);
  assert.match(agentSessionSource, /setMessages\(\(current\) => \[\.\.\.current, normalizeToolCalls\(displayedMessage\)\]\)/);
});

test("delegated User input is visibly attributed to its source Workflow Agent", async () => {
  const messageViewSource = await readFile(new URL("../components/MessageView.tsx", import.meta.url), "utf8");
  assert.match(messageViewSource, /const delegatedBy = message\.chatWorkflow/);
  assert.match(messageViewSource, /chat\.delegatedTask/);
  assert.match(messageViewSource, /chat\.delegatedByWorkflowAgent/);
  assert.match(messageViewSource, /workflow: delegatedBy\.workflowId/);
  assert.match(messageViewSource, /agent: delegatedBy\.agentId/);
});

test("plan review resumes the active Run and requires explicit cancellation", () => {
  assert.match(agentSessionSource, /runEvent\.type === "review_required"/);
  assert.match(agentSessionSource, /submitPlanReviewDecision\(reference, review, decision\)/);
  assert.match(agentSessionSource, /resumeChatWorkflowRun\(reference/);
  assert.match(agentSessionSource, /cancelChatWorkflowRun\(run\)/);
  assert.doesNotMatch(workflowBrowserSource, /addEventListener\("abort", cancelRun/);
});

test("clarification reviews expose blocking questions without an approval action", () => {
  assert.match(planReviewCardSource, /review\.readiness === "needs_clarification"/);
  assert.match(planReviewCardSource, /review\.blockingQuestions\.map/);
  assert.match(planReviewCardSource, /\{!needsClarification && \(/);
  assert.match(planReviewCardSource, /chat\.submitPlanClarification/);
  // The chat surface still renders that shared card.
  assert.match(chatWindowSource, /<PlanReviewCard/);
});

test("review decisions are timeline anchors instead of being absorbed into executor thinking", () => {
  assert.match(chatWindowSource, /chat\.plan_review_decision/);
  assert.match(chatWindowSource, /chat\.plan_review_feedback/);
});

test("legacy review decisions use a dedicated human-review presentation", async () => {
  const messageViewSource = await readFile(new URL("../components/MessageView.tsx", import.meta.url), "utf8");
  assert.match(messageViewSource, /customType === "chat\.plan_review_decision"/);
  assert.match(messageViewSource, /PlanReviewDecisionMessageView/);
  assert.match(messageViewSource, /chat\.humanReview/);
});
