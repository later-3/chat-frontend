import { parseFriendExecution, type FriendExecution } from "./friend-execution.ts";
import { workflowRequestSignal } from "./chat-workflow-browser.ts";

export interface FriendWork {
  id: string; longAgentId: string; sessionId: string; originSessionId: string; originEntryId: string | null;
  contextProjectId: string | null; requestId: string; payloadHash: string; title: string; createdAt: string;
}
export interface FriendWorkItem { work: FriendWork; execution: FriendExecution | null }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseFriendWorkItem(value: unknown, agentId: string): FriendWorkItem {
  if (!record(value) || !record(value.work)) throw new Error("无效后台工作响应");
  const w = value.work;
  const keys = ["id", "longAgentId", "sessionId", "originSessionId", "originEntryId", "contextProjectId", "requestId", "payloadHash", "title", "createdAt"];
  if (Object.keys(w).some(k => !keys.includes(k)) || keys.some(k => !(k in w))
    || !keys.filter(k => !["originEntryId", "contextProjectId"].includes(k)).every(k => typeof w[k] === "string" && w[k])
    || ![w.originEntryId, w.contextProjectId].every(v => v === null || (typeof v === "string" && v.length > 0))
    || w.longAgentId !== agentId || !/^work-[a-f0-9]{32}$/.test(String(w.id))
    || !/^[a-f0-9]{64}$/.test(String(w.payloadHash)) || !Number.isFinite(Date.parse(String(w.createdAt)))) throw new Error("后台工作绑定不匹配");
  const execution = value.execution === null ? null : parseFriendExecution(value.execution);
  if (execution && (execution.longAgentId !== agentId || execution.projectId !== agentId || execution.sessionId !== w.sessionId || execution.workId !== w.id
    || execution.contextProjectId !== w.contextProjectId)) throw new Error("后台工作执行身份不匹配");
  return { work: w as unknown as FriendWork, execution };
}
async function request(agentId: string, init: RequestInit = {}) {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(agentId)}/work`, { cache: "no-store", ...init });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(record(value) && typeof value.statusMessage === "string" ? value.statusMessage : `HTTP ${response.status}`);
  if (!record(value) || value.schemaVersion !== 1) throw new Error("不支持的后台工作版本");
  return value;
}
export async function fetchFriendWork(agentId: string, signal?: AbortSignal): Promise<FriendWorkItem[]> {
  const value = await request(agentId, { signal: workflowRequestSignal(signal) });
  if (!Array.isArray(value.works)) throw new Error("后台工作列表无效");
  return value.works.map(v => parseFriendWorkItem(v, agentId));
}
export async function startFriendWork(agentId: string, input: {
  requestId: string; originSessionId: string; contextProjectId: string | null; title: string; text: string;
}, signal?: AbortSignal) {
  return parseFriendWorkItem(await request(agentId, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, ...input }), signal: workflowRequestSignal(signal) }), agentId);
}
