import { test, expect, describe } from "bun:test";
import {
  aggregateTokens,
  aggregateTokensByModel,
  aggregateTokensByAgent,
  aggregateTokensByAgentModel,
  aggregateToolAttribution,
  aggregateTokensByInitiator,
  topNAgents,
} from "../lib/aggregation";
import type { AssistantMessage, UserMessage, TokenStatsByAgent } from "../lib/types";

describe("Token Aggregation", () => {
  describe("topNAgents", () => {
    const mockStats: TokenStatsByAgent = {
      "agent-a": { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 }, messageCount: 1 },
      "agent-b": { input: 200, output: 100, total: 300, reasoning: 0, cache: { read: 0, write: 0 }, messageCount: 1 },
      "agent-c": { input: 300, output: 150, total: 450, reasoning: 0, cache: { read: 0, write: 0 }, messageCount: 1 },
    };
    const mockCosts = {
      "agent-a": 0.5,
      "agent-b": 1.0,
      "agent-c": 1.5,
    };

    test("returns all agents when n > agent count", () => {
      const result = topNAgents(mockStats, mockCosts, 10, "cost");
      expect(result.rows).toHaveLength(3);
      expect(result.others).toBeUndefined();
    });

    test("returns all agents when n <= 0", () => {
      const result = topNAgents(mockStats, mockCosts, 0, "cost");
      expect(result.rows).toHaveLength(3);
      expect(result.others).toBeUndefined();

      const resultNeg = topNAgents(mockStats, mockCosts, -1, "cost");
      expect(resultNeg.rows).toHaveLength(3);
      expect(resultNeg.others).toBeUndefined();
    });

    test("aggregates others when n < agent count", () => {
      const result = topNAgents(mockStats, mockCosts, 2, "cost");
      expect(result.rows).toHaveLength(2);
      expect(result.others).toBeDefined();
      expect(result.others?.count).toBe(1);
      expect(result.others?.agent).toBe("Others");
    });

    test("sorts by cost descending", () => {
      const result = topNAgents(mockStats, mockCosts, 3, "cost");
      expect(result.rows[0]!.agent).toBe("agent-c");
      expect(result.rows[1]!.agent).toBe("agent-b");
      expect(result.rows[2]!.agent).toBe("agent-a");
    });

    test("sorts by tokens descending", () => {
      const result = topNAgents(mockStats, mockCosts, 3, "tokens");
      expect(result.rows[0]!.agent).toBe("agent-c");
      expect(result.rows[1]!.agent).toBe("agent-b");
      expect(result.rows[2]!.agent).toBe("agent-a");
    });

    test("tiebreaker is alphabetical agent name", () => {
      const tieStats: TokenStatsByAgent = {
        "agent-b": { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 }, messageCount: 1 },
        "agent-a": { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 }, messageCount: 1 },
      };
      const tieCosts = { "agent-a": 0.5, "agent-b": 0.5 };
      const result = topNAgents(tieStats, tieCosts, 2, "cost");
      expect(result.rows[0]!.agent).toBe("agent-a");
      expect(result.rows[1]!.agent).toBe("agent-b");
    });

    test("others aggregates stats correctly", () => {
      const stats5: TokenStatsByAgent = {
        "a1": { input: 10, output: 10, total: 20, reasoning: 1, cache: { read: 1, write: 1 }, messageCount: 1 },
        "a2": { input: 10, output: 10, total: 20, reasoning: 1, cache: { read: 1, write: 1 }, messageCount: 1 },
        "a3": { input: 10, output: 10, total: 20, reasoning: 1, cache: { read: 1, write: 1 }, messageCount: 1 },
        "a4": { input: 10, output: 10, total: 20, reasoning: 1, cache: { read: 1, write: 1 }, messageCount: 1 },
        "a5": { input: 10, output: 10, total: 20, reasoning: 1, cache: { read: 1, write: 1 }, messageCount: 1 },
      };
      const costs5 = { "a1": 1, "a2": 1, "a3": 1, "a4": 1, "a5": 1 };
      const result = topNAgents(stats5, costs5, 2, "cost");
      
      expect(result.rows).toHaveLength(2);
      expect(result.others).toBeDefined();
      expect(result.others?.count).toBe(3);
      expect(result.others?.stats).toEqual({
        input: 30,
        output: 30,
        total: 60,
        reasoning: 3,
        cache: { read: 3, write: 3 },
        messageCount: 3
      });
      expect(result.others?.cost).toBe(3);
    });

    test("handles empty stats", () => {
      const result = topNAgents({}, {}, 5, "cost");
      expect(result.rows).toHaveLength(0);
      expect(result.others).toBeUndefined();
    });
  });

  describe("aggregateTokens", () => {
    test("empty message array returns all zeros", () => {
      const result = aggregateTokens([]);

      expect(result).toEqual({
        input: 0,
        output: 0,
        total: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      });
    });

    test("single message aggregates correctly", () => {
      const messages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000, completed: 1704067215000 },
          parentID: "msg_user1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0024,
          tokens: {
            input: 1500,
            output: 800,
            reasoning: 0,
            cache: {
              read: 500,
              write: 200,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokens(messages);

      expect(result).toEqual({
        input: 1500,
        output: 800,
        total: 2300,
        reasoning: 0,
        cache: {
          read: 500,
          write: 200,
        },
      });
    });

    test("multiple messages sum correctly", () => {
      const messages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000, completed: 1704067215000 },
          parentID: "msg_user1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0024,
          tokens: {
            input: 1500,
            output: 800,
            reasoning: 0,
            cache: {
              read: 500,
              write: 200,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_2",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067300000, completed: 1704067345000 },
          parentID: "msg_user2",
          modelID: "o1",
          providerID: "openai",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0156,
          tokens: {
            input: 2000,
            output: 600,
            reasoning: 3500,
            cache: {
              read: 0,
              write: 0,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokens(messages);

      expect(result).toEqual({
        input: 3500,
        output: 1400,
        total: 4900,
        reasoning: 3500,
        cache: {
          read: 500,
          write: 200,
        },
      });
    });

    test("missing token fields treated as 0", () => {
      const messages: any[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000 },
          parentID: "msg_user1",
          modelID: "test-model",
          providerID: "test-provider",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0,
          tokens: {
            input: 100,
            output: 50,
            cache: {
              read: 10,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_2",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067300000 },
          parentID: "msg_user2",
          modelID: "test-model",
          providerID: "test-provider",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0,
          tokens: {
            input: 200,
            output: 100,
            reasoning: 50,
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokens(messages);

      expect(result).toEqual({
        input: 300,
        output: 150,
        total: 450,
        reasoning: 50,
        cache: {
          read: 10,
          write: 0,
        },
      });
    });
  });

  describe("aggregateTokensByModel", () => {
    test("groups tokens by model correctly", () => {
      const messages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000, completed: 1704067215000 },
          parentID: "msg_user1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0024,
          tokens: {
            input: 1500,
            output: 800,
            reasoning: 0,
            cache: {
              read: 500,
              write: 200,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_2",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067300000, completed: 1704067345000 },
          parentID: "msg_user2",
          modelID: "o1",
          providerID: "openai",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0156,
          tokens: {
            input: 2000,
            output: 600,
            reasoning: 3500,
            cache: {
              read: 0,
              write: 0,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_3",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067400000, completed: 1704067445000 },
          parentID: "msg_user3",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0018,
          tokens: {
            input: 1000,
            output: 500,
            reasoning: 0,
            cache: {
              read: 300,
              write: 100,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokensByModel(messages);

      expect(result).toEqual({
        "anthropic/claude-sonnet-4": {
          input: 2500,
          output: 1300,
          total: 3800,
          reasoning: 0,
          cache: {
            read: 800,
            write: 300,
          },
        },
        "openai/o1": {
          input: 2000,
          output: 600,
          total: 2600,
          reasoning: 3500,
          cache: {
            read: 0,
            write: 0,
          },
        },
      });
    });

    test("handles empty array", () => {
      const result = aggregateTokensByModel([]);
      expect(result).toEqual({});
    });
  });

  describe("aggregateTokensByAgent", () => {
    test("groups tokens by execution agent (mode)", () => {
      const messages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000, completed: 1704067215000 },
          parentID: "msg_user1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0024,
          tokens: {
            input: 1500,
            output: 800,
            reasoning: 0,
            cache: {
              read: 500,
              write: 200,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_2",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067300000, completed: 1704067345000 },
          parentID: "msg_user2",
          modelID: "o1",
          providerID: "openai",
          mode: "oracle",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0156,
          tokens: {
            input: 2000,
            output: 600,
            reasoning: 3500,
            cache: {
              read: 0,
              write: 0,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_3",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067400000, completed: 1704067445000 },
          parentID: "msg_user3",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0018,
          tokens: {
            input: 1000,
            output: 500,
            reasoning: 0,
            cache: {
              read: 300,
              write: 100,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokensByAgent(messages);
      
      expect(result).toEqual({
        "build": {
          input: 2500,
          output: 1300,
          total: 3800,
          reasoning: 0,
          cache: {
            read: 800,
            write: 300,
          },
          messageCount: 2,
        },
        "oracle": {
          input: 2000,
          output: 600,
          total: 2600,
          reasoning: 3500,
          cache: {
            read: 0,
            write: 0,
          },
          messageCount: 1,
        },
      });
    });

    test("aggregateTokensByAgent returns correct messageCount with different message distribution", () => {
      const messages: AssistantMessage[] = [
        { id: "m1", mode: "build", tokens: { input: 10, output: 5 } } as any,
        { id: "m2", mode: "build", tokens: { input: 10, output: 5 } } as any,
        { id: "m3", mode: "oracle", tokens: { input: 10, output: 5 } } as any,
      ];
      const result = aggregateTokensByAgent(messages);
      expect(result["build"]!.messageCount).toBe(2);
      expect(result["oracle"]!.messageCount).toBe(1);
    });

    test("handles empty array", () => {
      const result = aggregateTokensByAgent([]);
      expect(result).toEqual({});
    });

    test("uses 'unknown' for missing mode", () => {
      const messages: any[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000 },
          parentID: "msg_user1",
          modelID: "test-model",
          providerID: "test-provider",
          mode: "",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0,
          tokens: {
            input: 100,
            output: 50,
            reasoning: 0,
            cache: {
              read: 10,
              write: 5,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokensByAgent(messages);

      expect(result).toEqual({
        "unknown": {
          input: 100,
          output: 50,
          total: 150,
          reasoning: 0,
          cache: {
            read: 10,
            write: 5,
          },
          messageCount: 1,
        },
      });
    });
  });

  describe("aggregateTokensByAgentModel", () => {
    test("empty messages returns empty result", () => {
      const result = aggregateTokensByAgentModel([]);
      expect(result).toEqual({});
    });

    test("single agent single model returns single entry", () => {
      const messages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000 },
          parentID: "msg_user1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          cost: 0,
          tokens: {
            input: 100,
            output: 40,
            reasoning: 5,
            cache: { read: 10, write: 3 },
          },
        },
      ];

      const result = aggregateTokensByAgentModel(messages);

      expect(result).toEqual({
        "build|anthropic/claude-sonnet-4": {
          agent: "build",
          model: "anthropic/claude-sonnet-4",
          input: 100,
          output: 40,
          total: 140,
          reasoning: 5,
          cache: { read: 10, write: 3 },
          messageCount: 1,
        },
      });
    });

    test("same agent different models are separated", () => {
      const messages: AssistantMessage[] = [
        { id: "m1", mode: "build", providerID: "anthropic", modelID: "claude-sonnet-4", tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 1, write: 1 } } } as any,
        { id: "m2", mode: "build", providerID: "openai", modelID: "o1", tokens: { input: 20, output: 10, reasoning: 1, cache: { read: 0, write: 0 } } } as any,
      ];

      const result = aggregateTokensByAgentModel(messages);

      expect(Object.keys(result)).toEqual([
        "build|anthropic/claude-sonnet-4",
        "build|openai/o1",
      ]);
      expect(result["build|anthropic/claude-sonnet-4"]?.total).toBe(15);
      expect(result["build|openai/o1"]?.total).toBe(30);
    });

    test("different agents same model are separated", () => {
      const messages: AssistantMessage[] = [
        { id: "m1", mode: "build", providerID: "openai", modelID: "o1", tokens: { input: 30, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } } as any,
        { id: "m2", mode: "oracle", providerID: "openai", modelID: "o1", tokens: { input: 15, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } } as any,
      ];

      const result = aggregateTokensByAgentModel(messages);

      expect(Object.keys(result)).toEqual(["build|openai/o1", "oracle|openai/o1"]);
      expect(result["build|openai/o1"]?.agent).toBe("build");
      expect(result["oracle|openai/o1"]?.agent).toBe("oracle");
    });

    test("missing mode uses unknown agent key", () => {
      const messages: AssistantMessage[] = [
        { id: "m1", mode: "", providerID: "openai", modelID: "o1", tokens: { input: 12, output: 3, reasoning: 0, cache: { read: 0, write: 0 } } } as any,
      ];

      const result = aggregateTokensByAgentModel(messages);

      expect(result).toHaveProperty("unknown|openai/o1");
      expect(result["unknown|openai/o1"]?.agent).toBe("unknown");
    });

    test("messageCount tracks per agent-model combo", () => {
      const messages: AssistantMessage[] = [
        { id: "m1", mode: "build", providerID: "openai", modelID: "o1", tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } } as any,
        { id: "m2", mode: "build", providerID: "openai", modelID: "o1", tokens: { input: 20, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } } as any,
        { id: "m3", mode: "build", providerID: "anthropic", modelID: "claude-sonnet-4", tokens: { input: 5, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } } as any,
      ];

      const result = aggregateTokensByAgentModel(messages);

      expect(result["build|openai/o1"]?.messageCount).toBe(2);
      expect(result["build|anthropic/claude-sonnet-4"]?.messageCount).toBe(1);
    });
  });

  describe("aggregateToolAttribution", () => {
    test("empty parts returns empty byTool", () => {
      const result = aggregateToolAttribution([]);
      expect(result).toEqual({ byTool: {} });
    });

    test("tool part with completed state extracts title and tool", () => {
      const parts: any[] = [
        {
          type: "tool",
          tool: "read",
          state: {
            status: "completed",
            title: "Read file: src/index.ts",
          },
        },
      ];

      const result = aggregateToolAttribution(parts);

      expect(result.byTool["read"]).toEqual({
        tool: "read",
        title: "Read file: src/index.ts",
        callCount: 1,
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        cost: 0,
      });
    });

    test("tool part with pending/running/error state is skipped", () => {
      const parts: any[] = [
        { type: "tool", tool: "read", state: { status: "pending" } },
        { type: "tool", tool: "read", state: { status: "running" } },
        { type: "tool", tool: "read", state: { status: "error", error: "boom" } },
      ];

      const result = aggregateToolAttribution(parts);

      expect(result).toEqual({ byTool: {} });
    });

    test("multiple calls to same tool increments callCount", () => {
      const parts: any[] = [
        { type: "tool", tool: "read", state: { status: "completed", title: "Read one" } },
        { type: "tool", tool: "read", state: { status: "completed", title: "Read two" } },
      ];

      const result = aggregateToolAttribution(parts);

      expect(result.byTool["read"]?.callCount).toBe(2);
    });

    test("step-finish tokens are paired correctly", () => {
      const parts: any[] = [
        { type: "tool", tool: "grep", state: { status: "completed", title: "Search for pattern" } },
        {
          type: "step-finish",
          cost: 0.002,
          tokens: {
            input: 100,
            output: 50,
            reasoning: 25,
            cache: { read: 10, write: 5 },
          },
        },
      ];

      const result = aggregateToolAttribution(parts);

      expect(result.byTool["grep"]?.tokens).toEqual({
        input: 100,
        output: 50,
        total: 150,
        reasoning: 25,
        cache: { read: 10, write: 5 },
      });
      expect(result.byTool["grep"]?.cost).toBe(0.002);
    });

    test("missing step-finish uses zero tokens", () => {
      const parts: any[] = [
        { type: "tool", tool: "glob", state: { status: "completed", title: "Find files" } },
      ];

      const result = aggregateToolAttribution(parts);

      expect(result.byTool["glob"]?.tokens.total).toBe(0);
      expect(result.byTool["glob"]?.cost).toBe(0);
    });

    test("parts with no tool part returns empty result", () => {
      const parts: any[] = [
        { type: "text", text: "hello" },
        {
          type: "step-finish",
          cost: 0.001,
          tokens: {
            input: 10,
            output: 5,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
      ];

      const result = aggregateToolAttribution(parts);
      expect(result).toEqual({ byTool: {} });
    });

    test("security: title is truncated to max 60 chars", () => {
      const longTitle = "A".repeat(80);
      const parts: any[] = [
        { type: "tool", tool: "read", state: { status: "completed", title: longTitle } },
      ];

      const result = aggregateToolAttribution(parts);

      expect(result.byTool["read"]?.title.length).toBe(60);
      expect(result.byTool["read"]?.title.endsWith("...")).toBe(true);
    });
  });

  describe("aggregateTokensByInitiator", () => {
    test("groups tokens by parent user message agent", () => {
      const userMessages: UserMessage[] = [
        {
          id: "msg_user1",
          sessionID: "ses_1",
          role: "user",
          time: { created: 1704067100000 },
          agent: "prometheus",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
          },
        },
        {
          id: "msg_user2",
          sessionID: "ses_1",
          role: "user",
          time: { created: 1704067250000 },
          agent: "sisyphus",
          model: {
            providerID: "openai",
            modelID: "o1",
          },
        },
        {
          id: "msg_user3",
          sessionID: "ses_1",
          role: "user",
          time: { created: 1704067350000 },
          agent: "prometheus",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
          },
        },
      ];

      const assistantMessages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000, completed: 1704067215000 },
          parentID: "msg_user1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0024,
          tokens: {
            input: 1500,
            output: 800,
            reasoning: 0,
            cache: {
              read: 500,
              write: 200,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_2",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067300000, completed: 1704067345000 },
          parentID: "msg_user2",
          modelID: "o1",
          providerID: "openai",
          mode: "oracle",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0156,
          tokens: {
            input: 2000,
            output: 600,
            reasoning: 3500,
            cache: {
              read: 0,
              write: 0,
            },
          },
          finish: "stop",
        },
        {
          id: "msg_3",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067400000, completed: 1704067445000 },
          parentID: "msg_user3",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0018,
          tokens: {
            input: 1000,
            output: 500,
            reasoning: 0,
            cache: {
              read: 300,
              write: 100,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokensByInitiator(assistantMessages, userMessages);

      expect(result).toEqual({
        "prometheus": {
          input: 2500,
          output: 1300,
          total: 3800,
          reasoning: 0,
          cache: {
            read: 800,
            write: 300,
          },
          messageCount: 2,
        },
        "sisyphus": {
          input: 2000,
          output: 600,
          total: 2600,
          reasoning: 3500,
          cache: {
            read: 0,
            write: 0,
          },
          messageCount: 1,
        },
      });
    });

    test("handles empty arrays", () => {
      const result = aggregateTokensByInitiator([], []);
      expect(result).toEqual({});
    });

    test("uses 'unknown' for missing parent user message", () => {
      const userMessages: UserMessage[] = [];

      const assistantMessages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000, completed: 1704067215000 },
          parentID: "msg_user_missing",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0024,
          tokens: {
            input: 1500,
            output: 800,
            reasoning: 0,
            cache: {
              read: 500,
              write: 200,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokensByInitiator(assistantMessages, userMessages);

      expect(result).toEqual({
        "unknown": {
          input: 1500,
          output: 800,
          total: 2300,
          reasoning: 0,
          cache: {
            read: 500,
            write: 200,
          },
          messageCount: 1,
        },
      });
    });

    test("uses 'unknown' for empty agent field", () => {
      const userMessages: UserMessage[] = [
        {
          id: "msg_user1",
          sessionID: "ses_1",
          role: "user",
          time: { created: 1704067100000 },
          agent: "",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
          },
        },
      ];

      const assistantMessages: AssistantMessage[] = [
        {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 1704067200000, completed: 1704067215000 },
          parentID: "msg_user1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          summary: false,
          cost: 0.0024,
          tokens: {
            input: 1500,
            output: 800,
            reasoning: 0,
            cache: {
              read: 500,
              write: 200,
            },
          },
          finish: "stop",
        },
      ];

      const result = aggregateTokensByInitiator(assistantMessages, userMessages);

      expect(result).toEqual({
        "unknown": {
          input: 1500,
          output: 800,
          total: 2300,
          reasoning: 0,
          cache: {
            read: 500,
            write: 200,
          },
          messageCount: 1,
        },
      });
    });
  });
});
