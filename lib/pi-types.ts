/** 前端展示上下文占用量所需的数据；不依赖Pi运行时类型。 */
export interface ContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

/** 前端Session统计面板使用的只读投影。 */
export interface SessionStatsInfo {
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: ContextUsage;
  totalActiveMs?: number;
}
