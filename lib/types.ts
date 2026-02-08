import type { Part } from "@opencode-ai/sdk";

export type AssistantMessage = {
  id: string;
  sessionID: string;
  role: "assistant";
  time: {
    created: number;
    completed?: number;
  };
  parentID: string;
  modelID: string;
  providerID: string;
  mode: string;
  path: {
    cwd: string;
    root: string;
  };
  summary?: boolean;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  finish?: string;
};

export type TokenStats = {
  input: number;
  output: number;
  total: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
};

export type AgentTokenStats = TokenStats & {
  messageCount: number;
};

export type AgentModelTokenStats = AgentTokenStats & {
  agent: string;
  model: string;
};

export type TokenStatsByModel = {
  [key: string]: TokenStats;
};

export type TokenStatsByAgent = {
  [key: string]: AgentTokenStats;
};

export type TokenStatsByAgentModel = {
  [key: string]: AgentModelTokenStats;
};

export type ToolCallSummary = {
  tool: string;
  title: string;
  callCount: number;
  tokens: TokenStats;
  cost: number;
};

export type ToolAttributionResult = {
  byTool: Record<string, ToolCallSummary>;
};

export type UserMessage = {
  id: string;
  sessionID: string;
  role: "user";
  time: {
    created: number;
  };
  agent: string;
  model: {
    providerID: string;
    modelID: string;
  };
};

export type PreparedMessage = {
  info: AssistantMessage;
  parts: Part[];
};

export type ModelPricing = {
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million?: number;
  cache_write_per_million?: number;
};

export type PriceConfig = {
  [modelKey: string]: ModelPricing;
};

export type CostResult = {
  totalCost: number;
  byModel: { [modelKey: string]: number };
  warnings: string[];
};

export type SessionRecord = {
  sessionID: string;
  projectID?: string;
  timestamp: number;
  totals: TokenStats;
  byModel: TokenStatsByModel;
  cost: number;
};
