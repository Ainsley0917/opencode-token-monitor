import { describe, test, expect } from "bun:test";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type { AssistantMessage, PriceConfig } from "../lib/types";
import { listSessionTree, aggregateSessionTree } from "../lib/session-tree";

describe("Session Tree", () => {
  const mockMessages: AssistantMessage[] = [
    {
      id: "msg-1",
      sessionID: "root-session",
      role: "assistant",
      time: { created: Date.now(), completed: Date.now() },
      parentID: "parent-1",
      modelID: "claude-sonnet-4",
      providerID: "anthropic",
      mode: "build",
      path: { cwd: "/test", root: "/test" },
      cost: 0.005,
      tokens: {
        input: 100,
        output: 200,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ];

  const mockPricing: PriceConfig = {
    "anthropic/claude-sonnet-4": {
      input_per_million: 3.0,
      output_per_million: 15.0,
    },
  };

  describe("listSessionTree", () => {
    test("handles session with no children", async () => {
      const mockClient = {
        session: {
          messages: async () => ({
            data: mockMessages.map((msg) => ({ info: msg, parts: [] })),
            error: undefined,
          }),
          children: async () => ({ data: [], error: undefined }),
        },
      } as unknown as OpencodeClient;

      const result = await listSessionTree("root-session", mockClient);

      expect(result.sessionID).toBe("root-session");
      expect(result.messages).toHaveLength(1);
      expect(result.children).toHaveLength(0);
    });

    test("handles session with 2 children", async () => {
      const childMessages: AssistantMessage[] = [
        {
          id: "msg-child-1",
          sessionID: "child-session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
          parentID: "parent-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          cost: 0.002,
          tokens: {
            input: 50,
            output: 100,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
      ];

      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "root-session") {
              return {
                data: mockMessages.map((msg) => ({ info: msg, parts: [] })),
                error: undefined,
              };
            } else if (path.id === "child-session-1") {
              return {
                data: childMessages.map((msg) => ({ info: msg, parts: [] })),
                error: undefined,
              };
            } else if (path.id === "child-session-2") {
              return { data: [], error: undefined };
            }
            return { data: [], error: undefined };
          },
          children: async ({ path }: any) => {
            if (path.id === "root-session") {
              return {
                data: [
                  { id: "child-session-1", title: "Child 1" },
                  { id: "child-session-2", title: "Child 2" },
                ],
                error: undefined,
              };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const result = await listSessionTree("root-session", mockClient);

      expect(result.sessionID).toBe("root-session");
      expect(result.messages).toHaveLength(1);
      expect(result.children).toHaveLength(2);
      expect(result.children[0]!.sessionID).toBe("child-session-1");
      expect(result.children[0]!.messages).toHaveLength(1);
      expect(result.children[1]!.sessionID).toBe("child-session-2");
      expect(result.children[1]!.messages).toHaveLength(0);
    });

    test("detects and prevents cycles", async () => {
      let callCount = 0;
      const mockClient = {
        session: {
          messages: async () => ({
            data: mockMessages.map((msg) => ({ info: msg, parts: [] })),
            error: undefined,
          }),
          children: async ({ path }: any) => {
            callCount++;
            if (callCount > 10) {
              throw new Error("Infinite loop detected in test");
            }
            if (path.id === "root-session") {
              return { data: [{ id: "child-1" }], error: undefined };
            } else if (path.id === "child-1") {
              return { data: [{ id: "child-2" }], error: undefined };
            } else if (path.id === "child-2") {
              return { data: [{ id: "root-session" }], error: undefined };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const result = await listSessionTree("root-session", mockClient);

      expect(result.sessionID).toBe("root-session");
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.sessionID).toBe("child-1");
      expect(result.children[0]!.children).toHaveLength(1);
      expect(result.children[0]!.children[0]!.sessionID).toBe("child-2");
      expect(result.children[0]!.children[0]!.children).toHaveLength(0);
    });

    test("respects maxDepth limit", async () => {
      const mockClient = {
        session: {
          messages: async () => ({
            data: mockMessages.map((msg) => ({ info: msg, parts: [] })),
            error: undefined,
          }),
          children: async ({ path }: any) => {
            return { data: [{ id: `${path.id}-child` }], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const result = await listSessionTree("root", mockClient, { maxDepth: 2 });

      expect(result.sessionID).toBe("root");
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.sessionID).toBe("root-child");
      expect(result.children[0]!.children).toHaveLength(1);
      expect(result.children[0]!.children[0]!.sessionID).toBe("root-child-child");
      expect(result.children[0]!.children[0]!.children).toHaveLength(0);
    });

    test("handles child fetch errors gracefully", async () => {
      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "root-session") {
              return {
                data: mockMessages.map((msg) => ({ info: msg, parts: [] })),
                error: undefined,
              };
            } else if (path.id === "child-1") {
              return { data: undefined, error: "Not found" };
            }
            return { data: [], error: undefined };
          },
          children: async ({ path }: any) => {
            if (path.id === "root-session") {
              return {
                data: [{ id: "child-1" }, { id: "child-2" }],
                error: undefined,
              };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const result = await listSessionTree("root-session", mockClient);

      expect(result.sessionID).toBe("root-session");
      expect(result.children).toHaveLength(2);
      expect(result.children[0]!.sessionID).toBe("child-1");
      expect(result.children[0]!.messages).toHaveLength(0);
      expect(result.children[0]!.children).toHaveLength(0);
      expect(result.children[1]!.sessionID).toBe("child-2");
    });

    test("handles empty messages in child", async () => {
      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "root-session") {
              return {
                data: mockMessages.map((msg) => ({ info: msg, parts: [] })),
                error: undefined,
              };
            }
            return { data: [], error: undefined };
          },
          children: async ({ path }: any) => {
            if (path.id === "root-session") {
              return { data: [{ id: "child-empty" }], error: undefined };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const result = await listSessionTree("root-session", mockClient);

      expect(result.sessionID).toBe("root-session");
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.sessionID).toBe("child-empty");
      expect(result.children[0]!.messages).toHaveLength(0);
    });
  });

  describe("aggregateSessionTree", () => {
    test("aggregates single session (no children)", () => {
      const node = {
        sessionID: "root",
        messages: mockMessages,
        children: [],
      };

      const result = aggregateSessionTree(node, mockPricing);

      expect(result.totals.input).toBe(100);
      expect(result.totals.output).toBe(200);
      expect(result.totals.total).toBe(300);
      expect(result.byModel["anthropic/claude-sonnet-4"]).toBeDefined();
      expect(result.byModel["anthropic/claude-sonnet-4"]!.total).toBe(300);
      expect(result.childSummaries).toHaveLength(0);
    });

    test("aggregates session with children", () => {
      const node = {
        sessionID: "root",
        messages: mockMessages,
        children: [
          {
            sessionID: "child-1",
            messages: [
              {
                id: "msg-child-1",
                sessionID: "child-1",
                role: "assistant",
                time: { created: Date.now(), completed: Date.now() },
                parentID: "parent-1",
                modelID: "claude-sonnet-4",
                providerID: "anthropic",
                mode: "build",
                path: { cwd: "/test", root: "/test" },
                cost: 0.002,
                tokens: {
                  input: 50,
                  output: 100,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
              } as AssistantMessage,
            ],
            children: [],
          },
          {
            sessionID: "child-2",
            messages: [
              {
                id: "msg-child-2",
                sessionID: "child-2",
                role: "assistant",
                time: { created: Date.now(), completed: Date.now() },
                parentID: "parent-1",
                modelID: "gpt-4o",
                providerID: "openai",
                mode: "build",
                path: { cwd: "/test", root: "/test" },
                cost: 0.003,
                tokens: {
                  input: 30,
                  output: 70,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
              } as AssistantMessage,
            ],
            children: [],
          },
        ],
      };

      const result = aggregateSessionTree(node, mockPricing);

      expect(result.totals.input).toBe(100 + 50 + 30);
      expect(result.totals.output).toBe(200 + 100 + 70);
      expect(result.totals.total).toBe(300 + 150 + 100);

      expect(result.byModel["anthropic/claude-sonnet-4"]).toBeDefined();
      expect(result.byModel["openai/gpt-4o"]).toBeDefined();
      expect(result.byModel["anthropic/claude-sonnet-4"]!.total).toBe(450);
      expect(result.byModel["openai/gpt-4o"]!.total).toBe(100);

      expect(result.childSummaries).toHaveLength(2);
      expect(result.childSummaries[0]!.sessionID).toBe("child-1");
      expect(result.childSummaries[0]!.tokens.total).toBe(150);
      expect(result.childSummaries[1]!.sessionID).toBe("child-2");
      expect(result.childSummaries[1]!.tokens.total).toBe(100);
    });

    test("aggregates deeply nested children", () => {
      const node = {
        sessionID: "root",
        messages: mockMessages,
        children: [
          {
            sessionID: "child-1",
            messages: [
              {
                id: "msg-child-1",
                sessionID: "child-1",
                role: "assistant",
                time: { created: Date.now(), completed: Date.now() },
                parentID: "parent-1",
                modelID: "claude-sonnet-4",
                providerID: "anthropic",
                mode: "build",
                path: { cwd: "/test", root: "/test" },
                cost: 0.002,
                tokens: {
                  input: 50,
                  output: 100,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
              } as AssistantMessage,
            ],
            children: [
              {
                sessionID: "grandchild-1",
                messages: [
                  {
                    id: "msg-grandchild-1",
                    sessionID: "grandchild-1",
                    role: "assistant",
                    time: { created: Date.now(), completed: Date.now() },
                    parentID: "parent-1",
                    modelID: "claude-sonnet-4",
                    providerID: "anthropic",
                    mode: "build",
                    path: { cwd: "/test", root: "/test" },
                    cost: 0.001,
                    tokens: {
                      input: 25,
                      output: 50,
                      reasoning: 0,
                      cache: { read: 0, write: 0 },
                    },
                  } as AssistantMessage,
                ],
                children: [],
              },
            ],
          },
        ],
      };

      const result = aggregateSessionTree(node, mockPricing);

      expect(result.totals.input).toBe(100 + 50 + 25);
      expect(result.totals.output).toBe(200 + 100 + 50);
      expect(result.totals.total).toBe(300 + 150 + 75);

      expect(result.childSummaries).toHaveLength(1);
      expect(result.childSummaries[0]!.sessionID).toBe("child-1");
      expect(result.childSummaries[0]!.tokens.total).toBe(150 + 75);
    });

    test("handles empty children array", () => {
      const node = {
        sessionID: "root",
        messages: [],
        children: [],
      };

      const result = aggregateSessionTree(node, mockPricing);

      expect(result.totals.input).toBe(0);
      expect(result.totals.output).toBe(0);
      expect(result.totals.total).toBe(0);
      expect(Object.keys(result.byModel)).toHaveLength(0);
      expect(result.childSummaries).toHaveLength(0);
    });
  });
});
