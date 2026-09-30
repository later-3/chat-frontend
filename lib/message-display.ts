import type { AgentMessage, AssistantContentBlock, AssistantMessage, ThinkingContent, ToolCallContent } from "./types";
import { isSessionActivity } from "./session-activity.ts";

export function isSessionMemoryResponse(message: AgentMessage): boolean {
  return message.role === "assistant" && message.chatWorkflow?.stageId === "remember";
}

/** Memory bookkeeping must not replace the answer to the user's question after a refresh. */
export function findFinalAssistantIndex(messages: AgentMessage[], userIdx: number, endIdx: number): number {
  for (const requireAnswer of [true, false]) {
    for (let index = endIdx - 1; index > userIdx; index--) {
      const message = messages[index];
      if (message.role !== "assistant" || isSessionMemoryResponse(message) || isSessionActivity(message)) continue;
      if (!requireAnswer || splitFinalAssistantBlocks(message).answerBlocks.some(block =>
        block.type === "image" || (block.type === "text" && block.text.trim().length > 0))) return index;
    }
  }
  return -1;
}

/** Include a split answer's process at its original position, ahead of any memory tail. */
export function turnProcessIndices(messages: AgentMessage[], start: number, end: number, final: number): number[] {
  return messages.slice(start + 1, end).flatMap((message, offset) => {
    const index = start + offset + 1;
    if (isSessionActivity(message)) return [];
    if (index === final) return message.role === "assistant" && splitFinalAssistantBlocks(message).processBlocks.length > 0 ? [index] : [];
    return [index];
  });
}

interface DisplayOptions {
  isStreaming?: boolean;
}

export function isEmptyThinkingBlock(block: AssistantContentBlock, options: DisplayOptions = {}): block is ThinkingContent {
  return block.type === "thinking" && !block.deferred && !options.isStreaming && block.thinking.trim() === "";
}

export function getDisplayableAssistantBlocks(
  message: AssistantMessage,
  options: DisplayOptions = {},
): AssistantContentBlock[] {
  return (message.content ?? []).filter((block) => !isEmptyThinkingBlock(block, options));
}

export function getAssistantErrorMessage(
  message: AssistantMessage,
  options: DisplayOptions = {},
): string | null {
  if (options.isStreaming || message.stopReason !== "error") return null;
  return message.errorMessage?.trim() || "Unknown provider error";
}

function isFinalAnswerBlock(block: AssistantContentBlock): boolean {
  return block.type === "text" || block.type === "image";
}

export function splitFinalAssistantBlocks(
  message: AssistantMessage,
  options: DisplayOptions = {},
): { answerBlocks: AssistantContentBlock[]; processBlocks: AssistantContentBlock[] } {
  const blocks = getDisplayableAssistantBlocks(message, options);
  const lastProcessIndex = blocks.findLastIndex((block) => !isFinalAnswerBlock(block));
  if (lastProcessIndex === -1) {
    return { answerBlocks: blocks, processBlocks: [] };
  }
  return {
    answerBlocks: blocks.slice(lastProcessIndex + 1),
    processBlocks: blocks.slice(0, lastProcessIndex + 1),
  };
}

export function countToolCallBlocks(blocks: AssistantContentBlock[]): number {
  return blocks.filter((block): block is ToolCallContent => block.type === "toolCall").length;
}
