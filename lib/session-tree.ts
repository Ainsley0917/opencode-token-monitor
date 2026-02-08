import type { OpencodeClient } from "@opencode-ai/sdk";
import type {
  AssistantMessage,
  TokenStats,
  TokenStatsByModel,
  PriceConfig,
} from "./types";
import { aggregateTokens, aggregateTokensByModel } from "./aggregation";
import { calculateCost } from "./cost-calculator";

export type SessionTreeOptions = {
  maxDepth?: number;
};

export type SessionNode = {
  sessionID: string;
  messages: AssistantMessage[];
  children: SessionNode[];
};

export type ChildSessionSummary = {
  sessionID: string;
  tokens: TokenStats;
  cost: number;
};

export type SessionTreeStats = {
  totals: TokenStats;
  byModel: TokenStatsByModel;
  childSummaries: ChildSessionSummary[];
};

async function fetchMessagesForSession(
  sessionID: string,
  client: OpencodeClient
): Promise<AssistantMessage[]> {
  try {
    const response = await client.session.messages({
      path: { id: sessionID },
    });

    if (response.error || !response.data) {
      return [];
    }

    return response.data
      .filter((msg) => msg.info.role === "assistant")
      .map((msg) => msg.info as AssistantMessage);
  } catch {
    return [];
  }
}

async function fetchChildrenForSession(
  sessionID: string,
  client: OpencodeClient
): Promise<{ id: string }[]> {
  try {
    const response = await client.session.children({
      path: { id: sessionID },
    });

    if (response.error || !response.data) {
      return [];
    }

    return response.data.map((session) => ({ id: session.id }));
  } catch {
    return [];
  }
}

export async function listSessionTree(
  rootID: string,
  client: OpencodeClient,
  options: SessionTreeOptions = {}
): Promise<SessionNode> {
  const { maxDepth = 5 } = options;
  const visited = new Set<string>();

  async function buildTree(
    sessionID: string,
    depth: number
  ): Promise<SessionNode> {
    visited.add(sessionID);

    const messages = await fetchMessagesForSession(sessionID, client);

    if (depth >= maxDepth) {
      return {
        sessionID,
        messages,
        children: [],
      };
    }

    const childSessions = await fetchChildrenForSession(sessionID, client);

    const children: SessionNode[] = [];
    for (const childSession of childSessions) {
      if (visited.has(childSession.id)) {
        continue;
      }

      const childNode = await buildTree(childSession.id, depth + 1);
      children.push(childNode);
    }

    return {
      sessionID,
      messages,
      children,
    };
  }

  return buildTree(rootID, 0);
}

function collectAllMessages(node: SessionNode): AssistantMessage[] {
  const allMessages: AssistantMessage[] = [...node.messages];

  for (const child of node.children) {
    const childMessages = collectAllMessages(child);
    allMessages.push(...childMessages);
  }

  return allMessages;
}

export function aggregateSessionTree(
  node: SessionNode,
  pricing: PriceConfig
): SessionTreeStats {
  const allMessages = collectAllMessages(node);
  const totals = aggregateTokens(allMessages);
  const byModel = aggregateTokensByModel(allMessages);

  const childSummaries: ChildSessionSummary[] = [];
  for (const child of node.children) {
    const childMessages = collectAllMessages(child);
    const childTokens = aggregateTokens(childMessages);
    const childByModel = aggregateTokensByModel(childMessages);
    const childCostResult = calculateCost(childByModel, pricing);

    childSummaries.push({
      sessionID: child.sessionID,
      tokens: childTokens,
      cost: childCostResult.totalCost,
    });
  }

  return {
    totals,
    byModel,
    childSummaries,
  };
}
