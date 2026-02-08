import type {
  AssistantMessage,
  TokenStats,
  TokenStatsByModel,
  TokenStatsByAgent,
  TokenStatsByAgentModel,
  ToolAttributionResult,
  UserMessage,
} from "./types";

export function aggregateTokens(messages: AssistantMessage[]): TokenStats {
  const totals = messages.reduce(
    (acc, msg) => {
      const tokens = msg.tokens || {};
      const cache = tokens.cache || {};

      acc.input += tokens.input || 0;
      acc.output += tokens.output || 0;
      acc.reasoning += tokens.reasoning || 0;
      acc.cache.read += cache.read || 0;
      acc.cache.write += cache.write || 0;

      return acc;
    },
    {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    }
  );

  return {
    input: totals.input,
    output: totals.output,
    total: totals.input + totals.output,
    reasoning: totals.reasoning,
    cache: {
      read: totals.cache.read,
      write: totals.cache.write,
    },
  };
}

export function aggregateTokensByModel(
  messages: AssistantMessage[]
): TokenStatsByModel {
  const byModel: TokenStatsByModel = {};

  for (const msg of messages) {
    const modelKey = `${msg.providerID}/${msg.modelID}`;
    
    if (!byModel[modelKey]) {
      byModel[modelKey] = {
        input: 0,
        output: 0,
        total: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      };
    }

    const tokens = msg.tokens || {};
    const cache = tokens.cache || {};

    byModel[modelKey].input += tokens.input || 0;
    byModel[modelKey].output += tokens.output || 0;
    byModel[modelKey].reasoning += tokens.reasoning || 0;
    byModel[modelKey].cache.read += cache.read || 0;
    byModel[modelKey].cache.write += cache.write || 0;
    byModel[modelKey].total = byModel[modelKey].input + byModel[modelKey].output;
  }

  return byModel;
}

export function aggregateTokensByAgent(
  messages: AssistantMessage[]
): TokenStatsByAgent {
  const byAgent: TokenStatsByAgent = {};

  for (const msg of messages) {
    const agentKey = msg.mode && msg.mode.trim() !== "" ? msg.mode : "unknown";
    
    if (!byAgent[agentKey]) {
      byAgent[agentKey] = {
        input: 0,
        output: 0,
        total: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
        messageCount: 0,
      };
    }

    const tokens = msg.tokens || {};
    const cache = tokens.cache || {};

    byAgent[agentKey].input += tokens.input || 0;
    byAgent[agentKey].output += tokens.output || 0;
    byAgent[agentKey].reasoning += tokens.reasoning || 0;
    byAgent[agentKey].cache.read += cache.read || 0;
    byAgent[agentKey].cache.write += cache.write || 0;
    byAgent[agentKey].total = byAgent[agentKey].input + byAgent[agentKey].output;
    byAgent[agentKey].messageCount += 1;
  }

  return byAgent;
}

export function aggregateTokensByAgentModel(
  messages: AssistantMessage[]
): TokenStatsByAgentModel {
  const byAgentModel: TokenStatsByAgentModel = {};

  for (const msg of messages) {
    const agentKey = msg.mode && msg.mode.trim() !== "" ? msg.mode : "unknown";
    const modelKey = `${msg.providerID}/${msg.modelID}`;
    const agentModelKey = `${agentKey}|${modelKey}`;

    if (!byAgentModel[agentModelKey]) {
      byAgentModel[agentModelKey] = {
        agent: agentKey,
        model: modelKey,
        input: 0,
        output: 0,
        total: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
        messageCount: 0,
      };
    }

    const tokens = msg.tokens || {};
    const cache = tokens.cache || {};

    byAgentModel[agentModelKey].input += tokens.input || 0;
    byAgentModel[agentModelKey].output += tokens.output || 0;
    byAgentModel[agentModelKey].reasoning += tokens.reasoning || 0;
    byAgentModel[agentModelKey].cache.read += cache.read || 0;
    byAgentModel[agentModelKey].cache.write += cache.write || 0;
    byAgentModel[agentModelKey].total =
      byAgentModel[agentModelKey].input + byAgentModel[agentModelKey].output;
    byAgentModel[agentModelKey].messageCount += 1;
  }

  return byAgentModel;
}

export function aggregateToolAttribution(parts: any[]): ToolAttributionResult {
  const byTool: ToolAttributionResult["byTool"] = {};

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!part || part.type !== "tool") {
      continue;
    }

    const state = part.state || {};
    if (state.status !== "completed") {
      continue;
    }

    const toolName = typeof part.tool === "string" && part.tool.trim() !== "" ? part.tool : "unknown";
    const rawTitle = typeof state.title === "string" ? state.title : toolName;
    const title = rawTitle.length > 60 ? `${rawTitle.slice(0, 57)}...` : rawTitle;

    if (!byTool[toolName]) {
      byTool[toolName] = {
        tool: toolName,
        title,
        callCount: 0,
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          reasoning: 0,
          cache: {
            read: 0,
            write: 0,
          },
        },
        cost: 0,
      };
    }

    const nextPart = parts[i + 1];
    const prevPart = parts[i - 1];
    const stepFinishPart =
      nextPart && nextPart.type === "step-finish"
        ? nextPart
        : prevPart && prevPart.type === "step-finish"
          ? prevPart
          : undefined;

    const tokens = stepFinishPart?.tokens || {};
    const cache = tokens.cache || {};

    byTool[toolName].callCount += 1;
    byTool[toolName].tokens.input += tokens.input || 0;
    byTool[toolName].tokens.output += tokens.output || 0;
    byTool[toolName].tokens.reasoning += tokens.reasoning || 0;
    byTool[toolName].tokens.cache.read += cache.read || 0;
    byTool[toolName].tokens.cache.write += cache.write || 0;
    byTool[toolName].tokens.total =
      byTool[toolName].tokens.input + byTool[toolName].tokens.output;
    byTool[toolName].cost += stepFinishPart?.cost || 0;
  }

  return { byTool };
}

export function aggregateTokensByInitiator(
  messages: AssistantMessage[],
  userMessages: UserMessage[]
): TokenStatsByAgent {
  const byInitiator: TokenStatsByAgent = {};

  const parentIdToAgentMap = new Map<string, string>();
  for (const userMsg of userMessages) {
    parentIdToAgentMap.set(userMsg.id, userMsg.agent);
  }

  for (const msg of messages) {
    const userAgent = parentIdToAgentMap.get(msg.parentID);
    const agentKey = userAgent && userAgent.trim() !== "" ? userAgent : "unknown";
    
    if (!byInitiator[agentKey]) {
      byInitiator[agentKey] = {
        input: 0,
        output: 0,
        total: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
        messageCount: 0,
      };
    }

    const tokens = msg.tokens || {};
    const cache = tokens.cache || {};

    byInitiator[agentKey].input += tokens.input || 0;
    byInitiator[agentKey].output += tokens.output || 0;
    byInitiator[agentKey].reasoning += tokens.reasoning || 0;
    byInitiator[agentKey].cache.read += cache.read || 0;
    byInitiator[agentKey].cache.write += cache.write || 0;
    byInitiator[agentKey].total = byInitiator[agentKey].input + byInitiator[agentKey].output;
    byInitiator[agentKey].messageCount += 1;
  }

  return byInitiator;
}

export function topNAgents(
  stats: TokenStatsByAgent,
  costMap: Record<string, number>,
  n: number,
  sortBy: "cost" | "tokens"
): {
  rows: Array<{ agent: string; stats: TokenStatsByAgent[string]; cost: number }>;
  others?: { agent: string; stats: TokenStatsByAgent[string]; cost: number; count: number };
} {
  const agents = Object.keys(stats);
  if (agents.length === 0) {
    return { rows: [] };
  }

  const allRows = agents.map((agent) => ({
    agent,
    stats: stats[agent]!,
    cost: costMap[agent] || 0,
  }));

  allRows.sort((a, b) => {
    if (sortBy === "cost") {
      if (b.cost !== a.cost) {
        return b.cost - a.cost;
      }
    } else {
      if (b.stats.total !== a.stats.total) {
        return b.stats.total - a.stats.total;
      }
    }
    return a.agent.localeCompare(b.agent);
  });

  if (n <= 0 || agents.length <= n) {
    return { rows: allRows };
  }

  const topRows = allRows.slice(0, n);
  const remainingRows = allRows.slice(n);

  const othersStats: TokenStatsByAgent[string] = {
    input: 0,
    output: 0,
    total: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
    messageCount: 0,
  };
  let othersCost = 0;

  for (const row of remainingRows) {
    othersStats.input += row.stats.input;
    othersStats.output += row.stats.output;
    othersStats.total += row.stats.total;
    othersStats.reasoning += row.stats.reasoning;
    othersStats.cache.read += row.stats.cache.read;
    othersStats.cache.write += row.stats.cache.write;
    othersStats.messageCount += row.stats.messageCount;
    othersCost += row.cost;
  }

  return {
    rows: topRows,
    others: {
      agent: "Others",
      stats: othersStats,
      cost: othersCost,
      count: remainingRows.length,
    },
  };
}
