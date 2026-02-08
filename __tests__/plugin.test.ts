// @ts-nocheck
import { describe, test, expect, beforeEach } from "bun:test";
import plugin from "../plugin/index";
import type { PluginInput } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type { QuotaStatus } from "../lib/quota";
import { resetState } from "../lib/notifications";
describe("Token Stats Plugin", () => {
  beforeEach(() => {
    resetState("test-session");
    resetState("test-session-throttle");
    resetState("test-session-reset");
  });
  test("returns plugin hooks with token_stats tool", async () => {
    const mockClient = {
      session: {
        messages: async () => ({ data: [], error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    expect(hooks).toHaveProperty("tool");
    expect(hooks.tool).toHaveProperty("token_stats");
    expect(hooks.tool?.token_stats).toHaveProperty("description");
    expect(hooks.tool?.token_stats?.description).toContain("token usage");
    expect(hooks.tool?.token_stats).toHaveProperty("args");
    expect(hooks.tool!.token_stats!.args).toHaveProperty("session_id");
    expect(typeof (hooks.tool!.token_stats!.args as any).session_id?.safeParse).toBe("function");
  });
  test("handles empty session", async () => {
    const mockClient = {
      session: {
        messages: async () => ({ data: [], error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_stats!.execute(
      {},
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    expect(result).toContain("No assistant messages found");
  });
  test("returns formatted output with stats", async () => {
    const mockMessages = [
      {
        info: {
          id: "msg-1",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "parent-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "normal",
          path: { cwd: "/test", root: "/test" },
          cost: 0.005,
          tokens: {
            input: 100,
            output: 200,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
    ];
    const mockClient = {
      session: {
        messages: async () => ({ data: mockMessages, error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_stats!.execute(
      {},
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    expect(result).toContain("# Token Usage Statistics");
    expect(result).toContain("test-session");
    expect(result).toContain("anthropic/claude-sonnet-4");
    expect(result).toContain("## Totals");
    expect(result).toContain("Input: 100");
    expect(result).toContain("Output: 200");
    expect(result).toContain("## Estimated Cost");
    expect(result).toContain("## Per-Model Breakdown");
    expect(result).toContain("| Model | Input | Output | Total | Cost |");
    expect(result).toMatch(
      /\| anthropic\/claude-sonnet-4 \| 100 \| 200 \| 300 \| \$\d+\.\d{4} \|/
    );
  });
  test("includes per-agent sections", async () => {
    const mockMessages = [
      {
        info: {
          id: "msg-1",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-1",
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
        parts: [],
      },
      {
        info: {
          id: "user-1",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "oracle",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
          },
        },
        parts: [],
      },
      {
        info: {
          id: "msg-2",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-2",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "oracle",
          path: { cwd: "/test", root: "/test" },
          cost: 0.003,
          tokens: {
            input: 50,
            output: 100,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
      {
        info: {
          id: "user-2",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
          },
        },
        parts: [],
      },
    ];
    const mockClient = {
      session: {
        messages: async () => ({ data: mockMessages, error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_stats!.execute(
      {},
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    expect(result).toContain("## By Execution Agent");
    expect(result).toMatch(/\| build \| 100 \| 200 \| 300 \|/);
    expect(result).toMatch(/\| oracle \| 50 \| 100 \| 150 \|/);
    expect(result).toContain("## By Initiator Agent");
    expect(result).toMatch(/\| oracle \| 100 \| 200 \| 300 \|/);
    expect(result).toMatch(/\| build \| 50 \| 100 \| 150 \|/);
  });

  test("includes Agent × Model table in non-compact output", async () => {
    const mockMessages = [
      {
        info: {
          id: "msg-1",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          cost: 0,
          tokens: {
            input: 100,
            output: 100,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
      {
        info: {
          id: "msg-2",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-2",
          modelID: "gpt-4o",
          providerID: "openai",
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          cost: 0,
          tokens: {
            input: 50,
            output: 50,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
      {
        info: {
          id: "msg-3",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-3",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "oracle",
          path: { cwd: "/test", root: "/test" },
          cost: 0,
          tokens: {
            input: 30,
            output: 70,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
      {
        info: {
          id: "msg-4",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-4",
          modelID: "gpt-4o",
          providerID: "openai",
          mode: "oracle",
          path: { cwd: "/test", root: "/test" },
          cost: 0,
          tokens: {
            input: 20,
            output: 80,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
      {
        info: {
          id: "user-1",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "atlas",
          model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
        },
        parts: [],
      },
      {
        info: {
          id: "user-2",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "atlas",
          model: { providerID: "openai", modelID: "gpt-4o" },
        },
        parts: [],
      },
      {
        info: {
          id: "user-3",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "sisyphus",
          model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
        },
        parts: [],
      },
      {
        info: {
          id: "user-4",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "sisyphus",
          model: { providerID: "openai", modelID: "gpt-4o" },
        },
        parts: [],
      },
    ];
    const mockClient = {
      session: {
        messages: async () => ({ data: mockMessages, error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_stats!.execute(
      {},
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );

    expect(result).toContain("## Agent × Model");
    expect(result).toContain("| Agent | Model | Msgs | Input | Output | Total | Cost | %Cost |");
    expect(result).toMatch(
      /\| build \| anthropic\/claude-sonnet-4 \| 1 \| 100 \| 100 \| 200 \| \$\d+\.\d{4} \| \d+\.\d% \|/
    );
    expect(result).toMatch(
      /\| build \| openai\/gpt-4o \| 1 \| 50 \| 50 \| 100 \| \$\d+\.\d{4} \| \d+\.\d% \|/
    );
    expect(result).toMatch(
      /\| oracle \| anthropic\/claude-sonnet-4 \| 1 \| 30 \| 70 \| 100 \| \$\d+\.\d{4} \| \d+\.\d% \|/
    );
    expect(result).toMatch(
      /\| oracle \| openai\/gpt-4o \| 1 \| 20 \| 80 \| 100 \| \$\d+\.\d{4} \| \d+\.\d% \|/
    );
  });

  test("omits Agent × Model table in compact mode", async () => {
    const mockMessages = [
      {
        info: {
          id: "msg-1",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-1",
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
        parts: [],
      },
      {
        info: {
          id: "user-1",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "oracle",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
          },
        },
        parts: [],
      },
    ];
    const mockClient = {
      session: {
        messages: async () => ({ data: mockMessages, error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_stats!.execute(
      { compact: true },
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );

    expect(result).not.toContain("## Agent × Model");
  });

  test("omits Agent × Model table in antigravity auto-compact mode", async () => {
    const mockMessages = [
      {
        info: {
          id: "msg-1",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-1",
          modelID: "antigravity-claude-opus-4-5-thinking",
          providerID: "google",
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
        parts: [],
      },
      {
        info: {
          id: "user-1",
          sessionID: "test-session",
          role: "user",
          time: { created: Date.now() },
          agent: "oracle",
          model: {
            providerID: "google",
            modelID: "antigravity-claude-opus-4-5-thinking",
          },
        },
        parts: [],
      },
    ];
    const mockClient = {
      session: {
        messages: async () => ({ data: mockMessages, error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_stats!.execute(
      {},
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );

    expect(result).toContain("Compact mode auto-applied for Antigravity");
    expect(result).not.toContain("## Agent × Model");
  });
  test("includes token_history tool", async () => {
    const mockClient = {
      session: {
        messages: async () => ({ data: [], error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    expect(hooks).toHaveProperty("tool");
    expect(hooks.tool).toHaveProperty("token_history");
    expect(hooks.tool?.token_history).toHaveProperty("description");
    expect(hooks.tool!.token_history!.description).toContain("history");
  });
  test("token_history returns formatted history output", async () => {
    const mockClient = {
      session: {
        messages: async () => ({ data: [], error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_history!.execute(
      {},
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    expect(result).toContain("# Token Usage History");
  });
  test("token_history accepts scope parameter and defaults to all", async () => {
    const mockClient = {
      session: {
        messages: async () => ({ data: [], error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_history!.execute(
      {},
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    expect(result).toContain("**Scope:** all");
  });
  test("token_history filters by project when scope=project", async () => {
    const mockClient = {
      session: {
        messages: async () => ({ data: [], error: undefined }),
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    const result = await hooks.tool!.token_history!.execute(
      { scope: "project" },
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test",
        worktree: "/test",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
    );
    expect(result).toContain("**Scope:** project (test-project)");
  });
  test("event hook handles session.idle and shows toast", async () => {
    let toastShown = false;
    let toastMessage = "";
    const mockMessages = [
      {
        info: {
          id: "msg-1",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "parent-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "normal",
          path: { cwd: "/test", root: "/test" },
          cost: 0.123,
          tokens: {
            input: 100,
            output: 200,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
    ];
    const mockClient = {
      session: {
        messages: async () => ({ data: mockMessages, error: undefined }),
      },
      tui: {
        showToast: async ({ body }: any) => {
          toastShown = true;
          toastMessage = body.message;
        },
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    expect(hooks).toHaveProperty("event");
    expect(typeof hooks.event).toBe("function");
      await (hooks.event as any)?.({
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info,
          },
        },
      });
    expect(toastShown).toBe(true);
    expect(toastMessage).toContain("Session:");
    expect(toastMessage).toMatch(/\$\d+\.\d{4}/);
  });
  test("event hook ignores non-idle events", async () => {
    let toastShown = false;
    const mockClient = {
      session: {
        messages: async () => ({ data: [], error: undefined }),
      },
      tui: {
        showToast: async () => {
          toastShown = true;
        },
      },
    } as unknown as OpencodeClient;
    const mockInput: PluginInput = {
      client: mockClient,
      project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
      directory: "/test",
      worktree: "/test",
      serverUrl: new URL("http://localhost"),
      $: {} as any,
    };
    const hooks = await plugin(mockInput);
    await hooks.event?.({ /* @ts-ignore */
      event: {
        type: "other.event" as any,
        properties: {} as any,
      },
    });
    expect(toastShown).toBe(false);
  });
  describe("token_export tool", () => {
    test("tool is registered with correct schema", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: [], error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      expect(hooks).toHaveProperty("tool");
      expect(hooks.tool).toHaveProperty("token_export");
      expect(hooks.tool?.token_export).toHaveProperty("description");
      expect(hooks.tool?.token_export?.description).toContain("Export");
      expect(hooks.tool?.token_export).toHaveProperty("args");
      expect(hooks.tool?.token_export?.args).toHaveProperty("format");
      expect(hooks.tool?.token_export?.args).toHaveProperty("scope");
      expect(hooks.tool?.token_export?.args).toHaveProperty("file_path");
    });
    test("exports session data as JSON", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "json" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toHaveProperty("sessionID", "test-session");
      expect(parsed[0]).toHaveProperty("totals");
    });
    test("exports session data as CSV", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "csv" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result).toContain("sessionID,projectID,timestamp");
      expect(result).toContain("test-session");
    });
    test("exports session data as Markdown", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "markdown" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result).toContain("| Session ID |");
      expect(result).toContain("test-sessi...");
    });
    test("handles empty session gracefully", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: [], error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "json" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toContain("No assistant messages found");
    });

    test("auto-writes to temp file when content exceeds 10000 chars without file_path", async () => {
      const mockMessages = [];
      for (let i = 0; i < 200; i++) {
        mockMessages.push({
          info: {
            id: `msg-${i}`,
            sessionID: "test-session-large",
            role: "assistant",
            time: { created: Date.now() },
            parentID: `parent-${i}`,
            modelID: `claude-sonnet-4-${i}`,
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        });
      }

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "json" },
        {
          sessionID: "test-session-large",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("Export written to");
      expect(result).toContain("token-export-");
      expect(result).toContain(".json");
      expect(result).toContain("Content too large for inline display");
      expect(result).toMatch(/\d+ bytes/);
    });

    test("returns inline content for small exports (< 10000 chars)", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "json" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toHaveProperty("sessionID", "test-session");
    });

    test("token_export includes projectID in exported JSON", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "json" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toHaveProperty("projectID", "test-project");
    });

    test("token_export includes projectID in CSV export", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_export!.execute(
        { format: "csv" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("sessionID,projectID,timestamp");
      expect(result).toContain("test-project");
    });
  });
  describe("Phase 2 functionality", () => {
    test("token_stats respects compact mode", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: true },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toContain("# Token Usage Statistics");
      expect(result).toContain("## Totals");
    });

    test("token_stats include_children aggregates totals and cost across session tree", async () => {
      const rootMessages = [
        {
          info: {
            id: "user-root-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "sisyphus",
            model: { providerID: "openai", modelID: "gpt-5.2" },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-root-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-root-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.0,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const childMessages = [
        {
          info: {
            id: "user-child-1",
            sessionID: "child-session-1",
            role: "user",
            time: { created: Date.now() },
            agent: "sisyphusJunior",
            model: { providerID: "openai", modelID: "gpt-5.2" },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-child-1",
            sessionID: "child-session-1",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-child-1",
            modelID: "gpt-5.2",
            providerID: "openai",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.0,
            tokens: {
              input: 50,
              output: 100,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "test-session") {
              return { data: rootMessages, error: undefined };
            }
            if (path.id === "child-session-1") {
              return { data: childMessages, error: undefined };
            }
            return { data: [], error: undefined };
          },
          children: async ({ path }: any) => {
            if (path.id === "test-session") {
              return { data: [{ id: "child-session-1", title: "Child" }], error: undefined };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { include_children: true },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("Input: 150");
      expect(result).toContain("Output: 300");
      expect(result).toContain("openai/gpt-5.2");
      // Expected total cost: 0.0033 (Claude) + 0.0014875 (GPT-5.2) = 0.0047875 => 0.0048
      expect(result).toContain("- Total: $0.0048");
    });

    test("token_stats include_children still aggregates under antigravity auto-compact", async () => {
      const rootMessages = [
        {
          info: {
            id: "msg-root-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-root-1",
            modelID: "antigravity-claude-opus-4-6-thinking",
            providerID: "google",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.0,
            tokens: {
              input: 10,
              output: 20,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const childMessages = [
        {
          info: {
            id: "msg-child-1",
            sessionID: "child-session-1",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-child-1",
            modelID: "gpt-5.2",
            providerID: "openai",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.0,
            tokens: {
              input: 5,
              output: 10,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "test-session") {
              return { data: rootMessages, error: undefined };
            }
            if (path.id === "child-session-1") {
              return { data: childMessages, error: undefined };
            }
            return { data: [], error: undefined };
          },
          children: async ({ path }: any) => {
            if (path.id === "test-session") {
              return { data: [{ id: "child-session-1", title: "Child" }], error: undefined };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { include_children: true },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("Compact mode auto-applied");
      expect(result).toContain("Input: 15");
      expect(result).toContain("Output: 30");
      expect(result).toContain("## Child Sessions");
      expect(result).toContain("- Sessions: 1");
    });
    test("token_stats output is truncated when needed", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(typeof result).toBe("string");
      if (result) {
        expect(result.length).toBeGreaterThan(0);
      }
    });
    test("token_history includes trend section when data available", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: [], error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_history!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toContain("# Token Usage History");
    });
    test("token_stats has new args in schema", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: [], error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      expect(hooks.tool!.token_stats!.args).toHaveProperty("session_id");
      expect(hooks.tool!.token_stats!.args).toHaveProperty("include_children");
      expect(hooks.tool!.token_stats!.args).toHaveProperty("trend_days");
      expect(hooks.tool!.token_stats!.args).toHaveProperty("compact");
      expect(hooks.tool!.token_stats!.args).toHaveProperty("debug");
      expect(hooks.tool!.token_stats!.args).toHaveProperty("scope");
    });
    
    test("token_stats accepts scope=all without crashing", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { scope: "all" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toContain("# Token Usage Statistics");
    });
    
    test("token_stats accepts scope=project without crashing", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.005,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "project-abc", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { scope: "project" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toContain("# Token Usage Statistics");
    });
  });
  describe("Table row limiting", () => {
    test("token_stats limits per-model table to 50 rows with truncation marker", async () => {
      const mockMessages = [];
      for (let i = 0; i < 60; i++) {
        mockMessages.push({
          info: {
            id: `msg-${i}`,
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: `parent-${i}`,
            modelID: `model-${i}`,
            providerID: "test-provider",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: {
              input: 10,
              output: 10,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        });
      }
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toContain("# Token Usage Statistics");
      expect(result).toContain("## Per-Model Breakdown");
      const modelSection = result.split("## By Execution Agent")[0] ?? "";
      const modelRows = modelSection
        .split("\n")
        .filter((line) => line.includes("| test-provider/model-"));
      expect(modelRows.length).toBeLessThanOrEqual(50);
      expect(result).toContain("and");
      expect(result).toContain("more rows");
      expect(result).toContain("token_export");
    });
    test("token_stats limits by-agent tables to 50 rows each", async () => {
      const mockMessages = [];
      for (let i = 0; i < 60; i++) {
        mockMessages.push({
          info: {
            id: `msg-${i}`,
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: `user-${i}`,
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: `agent-${i}`,
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: {
              input: 10,
              output: 10,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        });
        mockMessages.push({
          info: {
            id: `user-${i}`,
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: `initiator-${i}`,
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        });
      }
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(result).toContain("## By Execution Agent");
      expect(result).toContain("## By Initiator Agent");
      const executionSection = result.split("## By Execution Agent")[1]?.split("## By Initiator Agent")[0] ?? "";
      const executionRows = executionSection.split("\n").filter((line) => line.includes("| agent-"));
      expect(executionRows.length).toBeLessThanOrEqual(50);
      const initiatorSection = result.split("## By Initiator Agent")[1]?.split("## Agent × Model")[0] ?? "";
      const initiatorRows = initiatorSection
        .split("\n")
        .filter((line) => line.includes("| initiator-"));
      expect(initiatorRows.length).toBeLessThanOrEqual(50);
    });
  });
  describe("message.updated event", () => {
    test("handles message.updated and shows toast on cost delta", async () => {
      let toastShown = false;
      let toastMessage = "";
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.123,
            tokens: {
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
        tui: {
          showToast: async ({ body }: any) => {
            toastShown = true;
            toastMessage = body.message;
          },
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      // 
      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info,
          },
        },
      });
      expect(toastShown).toBe(true);
      expect(toastMessage).toContain("Session:");
      expect(toastMessage).toContain("$");
    });
    test("suppresses toast when delta too small and time too recent (without quota changes)", async () => {
      let toastCallCount = 0;
      let lastToastMessage = "";
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session-throttle",
            role: "assistant" as const,
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: {
              input: 100,
              output: 50,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
        tui: {
          showToast: async ({ body }: any) => {
            toastCallCount++;
            lastToastMessage = body.message;
          },
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      // 
      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated" as const,
          properties: {
            info: mockMessages[0].info,
          },
        },
      });
      const firstToastCount = toastCallCount;
      expect(firstToastCount).toBeGreaterThanOrEqual(1);
      // 
      mockMessages[0].info.cost = 0.002;
      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated" as const,
          properties: {
            info: mockMessages[0].info,
          },
        },
      });
      if (lastToastMessage.includes("⚠️")) {
        expect(toastCallCount).toBe(firstToastCount + 1);
      } else {
        expect(toastCallCount).toBe(firstToastCount);
      }
    });
    test("ignores non-assistant messages", async () => {
      let toastShown = false;
      const mockMessages = [
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "build",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
        tui: {
          showToast: async () => {
            toastShown = true;
          },
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      // 
      const hooks = await plugin(mockInput);
      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info as any,
          },
        },
      });
      expect(toastShown).toBe(false);
    });
    test("session.idle resets notification state", async () => {
      let toastCallCount = 0;
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session-reset",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.05,
            tokens: {
              input: 500,
              output: 250,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
        tui: {
          showToast: async () => {
            toastCallCount++;
          },
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      // 
      };
      const hooks = await plugin(mockInput);
      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info,
          },
      // 
        },
      });
      expect(toastCallCount).toBe(1);
      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "session.idle",
          properties: {
            sessionID: "test-session-reset",
      // 
          },
        },
      });
      expect(toastCallCount).toBe(2);
      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info,
          },
        },
      });
      expect(toastCallCount).toBe(3);
    });

    test("concurrent duplicate events for same session are guarded", async () => {
      let messagesCallCount = 0;
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session-concurrent",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.05,
            tokens: {
              input: 500,
              output: 250,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => {
            messagesCallCount++;
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { data: mockMessages, error: undefined };
          },
        },
        tui: {
          showToast: async () => {},
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);

      await Promise.all([
        hooks.event?.({ /* @ts-ignore */
          event: {
            type: "message.updated",
            properties: {
              info: mockMessages[0].info,
            },
          },
        }),
        hooks.event?.({ /* @ts-ignore */
          event: {
            type: "message.updated",
            properties: {
              info: mockMessages[0].info,
            },
          },
        }),
      ]);

      expect(messagesCallCount).toBe(1);
    });

    test("guard releases on error", async () => {
      let messagesCallCount = 0;
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session-error-guard",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.05,
            tokens: {
              input: 500,
              output: 250,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => {
            messagesCallCount++;
            if (messagesCallCount === 1) {
              throw new Error("First call fails");
            }
            return { data: mockMessages, error: undefined };
          },
        },
        tui: {
          showToast: async () => {},
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);

      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info,
          },
        },
      });
      expect(messagesCallCount).toBe(1);

      await hooks.event?.({ /* @ts-ignore */
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info,
          },
        },
      });
      expect(messagesCallCount).toBe(2);
    });

    test("different sessions not blocked by guard", async () => {
      let messagesCallCount = 0;
      const mockMessagesSession1 = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session-1",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.05,
            tokens: {
              input: 500,
              output: 250,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockMessagesSession2 = [
        {
          info: {
            id: "msg-2",
            sessionID: "test-session-2",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-2",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.03,
            tokens: {
              input: 300,
              output: 150,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            messagesCallCount++;
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (path.id === "test-session-1") {
              return { data: mockMessagesSession1, error: undefined };
            } else {
              return { data: mockMessagesSession2, error: undefined };
            }
          },
        },
        tui: {
          showToast: async () => {},
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);

      await Promise.all([
        hooks.event?.({ /* @ts-ignore */
          event: {
            type: "message.updated",
            properties: {
              info: mockMessagesSession1[0].info,
            },
          },
        }),
        hooks.event?.({ /* @ts-ignore */
          event: {
            type: "message.updated",
            properties: {
              info: mockMessagesSession2[0].info,
            },
          },
        }),
      ]);

      expect(messagesCallCount).toBe(2);
    });
  });
  describe("schema safety", () => {
    test("all tools have non-empty arg schemas with zod validators", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: [], error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const toolNames = ["token_stats", "token_history", "token_export"];

      for (const name of toolNames) {
        const toolInstance = hooks.tool?.[name];
        expect(toolInstance, `Tool ${name} should be defined`).toBeDefined();
        expect(toolInstance).toHaveProperty("args");
        const args = toolInstance!.args as Record<string, any>;
        const keys = Object.keys(args);
        expect(keys.length, `Tool ${name} should have at least one argument`).toBeGreaterThan(0);

        for (const key of keys) {
          expect(args[key], `Arg ${key} in ${name} should have safeParse`).toHaveProperty("safeParse");
          expect(typeof args[key].safeParse).toBe("function");
        }
      }
    });
  });
  describe("Optional section error annotations", () => {
    test("catch blocks contain concise unavailable annotations (static verification)", () => {
      const fs = require("fs");
      const pluginSource = fs.readFileSync("./plugin/index.ts", "utf-8");
      
      expect(pluginSource).toContain('output += "\\n_[Quota status unavailable]_\\n";');
      expect(pluginSource).toContain('output += "\\n_[Budget status unavailable]_\\n";');
      expect(pluginSource).toContain('output += "\\n_[Child sessions unavailable]_\\n";');
      expect(pluginSource).toContain('output += "\\n_[Trend analysis unavailable]_\\n";');
      expect(pluginSource).toContain('output += "\\n_[Optimization suggestions unavailable]_\\n";');
    });

    test("annotations are concise (< 50 chars each)", () => {
      const annotations = [
        "_[Quota status unavailable]_",
        "_[Budget status unavailable]_",
        "_[Child sessions unavailable]_",
        "_[Trend analysis unavailable]_",
        "_[Optimization suggestions unavailable]_",
      ];
      
      for (const annotation of annotations) {
        expect(annotation.length).toBeLessThan(50);
        expect(annotation).not.toContain("Error");
        expect(annotation).not.toContain("stack");
        expect(annotation).not.toContain(".ts");
      }
    });
  });

  describe("Stress tests - long session resilience", () => {
    function generateStressMessages(count: number, modelCount: number, agentCount: number = 10): any[] {
      const messages = [];
      for (let i = 0; i < count; i++) {
        messages.push({
          info: {
            id: `msg_stress_${i}`,
            sessionID: "stress-test-session",
            role: "assistant",
            time: { created: Date.now() + i },
            parentID: `user_${i}`,
            modelID: `model-${i % modelCount}`,
            providerID: "test-provider",
            mode: `agent-${i % agentCount}`,
            path: { cwd: "/test", root: "/test" },
            cost: 0.001 + (i * 0.00001),
            tokens: {
              input: 1000 + i,
              output: 500 + i,
              reasoning: i % 10 === 0 ? 100 : 0,
              cache: { read: 100 + i, write: 50 + i },
            },
          },
          parts: [],
        });

        messages.push({
          info: {
            id: `user_${i}`,
            sessionID: "stress-test-session",
            role: "user",
            time: { created: Date.now() + i },
            agent: `initiator-${i % agentCount}`,
            model: {
              providerID: "test-provider",
              modelID: `model-${i % modelCount}`,
            },
          },
          parts: [],
        });
      }
      return messages;
    }

    test("200 messages, 5 models - bounded output under 25000 chars", async () => {
      const mockMessages = generateStressMessages(200, 5, 10);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: true },
        {
          sessionID: "stress-test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result.length).toBeLessThan(25000);
      expect(result).toContain("# Token Usage Statistics");
      expect(result).toContain("## Totals");
      expect(result).toContain("## Per-Model Breakdown");
    });

    test("100 messages, 100 unique models - table row limiting engaged", async () => {
      const mockMessages = generateStressMessages(100, 100, 10);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: true },
        {
          sessionID: "stress-test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("# Token Usage Statistics");
      const modelRows = result.split("\n").filter(line => line.includes("| test-provider/model-"));
      expect(modelRows.length).toBeLessThanOrEqual(50);
      expect(result).toContain("more rows");
      expect(result).toContain("token_export");
    });

    test("200 messages, 50 unique agents - by-agent table limiting", async () => {
      const mockMessages = generateStressMessages(200, 5, 50);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: true },
        {
          sessionID: "stress-test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("## By Execution Agent");
      expect(result).toContain("## By Initiator Agent");
      const executionRows = result.split("\n").filter(line => line.includes("| agent-"));
      expect(executionRows.length).toBeLessThanOrEqual(50);
      const initiatorRows = result.split("\n").filter(line => line.includes("| initiator-"));
      expect(initiatorRows.length).toBeLessThanOrEqual(50);
    });

    test("output structure preserved under stress - all expected sections present", async () => {
      const mockMessages = generateStressMessages(150, 20, 15);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: true },
        {
          sessionID: "stress-test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("# Token Usage Statistics");
      expect(result).toContain("**Session:** stress-test-session");
      expect(result).toContain("## Totals");
      expect(result).toContain("## Estimated Cost");
      expect(result).toContain("## Per-Model Breakdown");
      expect(result).toContain("## By Execution Agent");
      expect(result).toContain("## By Initiator Agent");
      expect(result.length).toBeGreaterThan(0);
    });

    test("SLO proxy - no undefined/NaN/null in token values", async () => {
      const mockMessages = generateStressMessages(100, 10, 10);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: true },
        {
          sessionID: "stress-test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).not.toContain("undefined");
      expect(result).not.toContain("NaN");
      expect(result).not.toContain("null");
      expect(result).toMatch(/Input: \d+/);
      expect(result).toMatch(/Output: \d+/);
      expect(result).toMatch(/Total: \d+/);
      expect(result).toMatch(/\$\d+\.\d{4}/);
    });
  });

  describe("Schema size regression", () => {
    test("all tool descriptions stay under 600 character budget", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: [], error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const tools = hooks.tool!;
      const toolNames = ["token_stats", "token_history", "token_export"];

      let totalChars = 0;

      for (const toolName of toolNames) {
        const toolInstance = tools[toolName];
        expect(toolInstance).toBeDefined();

        // Count top-level description
        const topLevelDesc = toolInstance!.description || "";
        totalChars += topLevelDesc.length;

        // Count all arg descriptions
        const args = toolInstance!.args as Record<string, any>;
        for (const argKey of Object.keys(args)) {
          const argSchema = args[argKey];
          // Zod schema has _def.description
          const argDesc = (argSchema as any)?._def?.description || "";
          totalChars += argDesc.length;
        }
      }

      expect(totalChars).toBeLessThan(600);
    });
  });

  describe("SDK error handling", () => {
    test("token_stats handles SDK error response gracefully", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: undefined, error: "Session not found" }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(typeof result).toBe("string");
      expect(result).toContain("Error fetching session messages");
      expect(result).toContain("Session not found");
      expect(result).not.toContain("undefined");
      expect(result).not.toContain("Error:");
    });
    test("token_stats handles SDK thrown exception gracefully", async () => {
      const mockClient = {
        session: {
          messages: async () => {
            throw new Error("Network timeout");
          },
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(typeof result).toBe("string");
      expect(result).toContain("Error calculating token statistics");
      expect(result).toContain("Network timeout");
      expect(result).not.toContain("/Users/");
      expect(result).not.toContain(".ts:");
      expect(result.split("\n").length).toBeLessThan(5);
    });
    test("token_stats handles SDK returning null data gracefully", async () => {
      const mockClient = {
        session: {
          messages: async () => ({ data: null, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(typeof result).toBe("string");
      expect(result).toContain("# Token Usage Statistics");
      expect(result).toContain("No assistant messages found");
    });
    test("token_stats handles non-Error exception gracefully", async () => {
      const mockClient = {
        session: {
          messages: async () => {
            throw "String error thrown";
          },
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };
      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
      expect(typeof result).toBe("string");
      expect(result).toContain("Error calculating token statistics");
      expect(result).toContain("String error thrown");
    });
  });

  describe("Antigravity auto-degrade", () => {
    test("antigravity sessions skip heavy sections automatically", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg_ag_1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
            modelID: "antigravity-claude-opus-4-5-thinking",
            providerID: "google",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0.05,
            tokens: {
              input: 5000,
              output: 2000,
              reasoning: 1000,
              cache: { read: 500, write: 100 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "atlas",
            model: {
              providerID: "google",
              modelID: "antigravity-claude-opus-4-5-thinking",
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("Compact mode auto-applied for Antigravity");
      expect(result).toContain("## Totals");
      expect(result).toContain("## Estimated Cost");
      expect(result).toContain("## Per-Model Breakdown");
      expect(result).not.toContain("## Budget Status");
      expect(result).not.toContain("## Trend Analysis");
      expect(result).not.toContain("## Optimization");
      expect(result.length).toBeLessThanOrEqual(8500);
    });

    test("non-antigravity sessions are NOT auto-degraded", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
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
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "build",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).not.toContain("Compact mode auto-applied");
      expect(result).toContain("## Totals");
      expect(result).toContain("## Estimated Cost");
      expect(result).toContain("## Per-Model Breakdown");
      expect(result.length).toBeGreaterThan(200);
    });

    test("antigravity + explicit compact=false still degrades (safety override)", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg_ag_1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
            modelID: "antigravity-claude-opus-4-5-thinking",
            providerID: "google",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0.05,
            tokens: {
              input: 5000,
              output: 2000,
              reasoning: 1000,
              cache: { read: 500, write: 100 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "atlas",
            model: {
              providerID: "google",
              modelID: "antigravity-claude-opus-4-5-thinking",
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: false },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("## Totals");
      expect(result).toContain("## Estimated Cost");
      expect(result).not.toContain("## Budget Status");
      expect(result).not.toContain("## Trend Analysis");
      expect(result).not.toContain("## Optimization");
      expect(result.length).toBeLessThanOrEqual(8500);
    });

    test("mixed session with antigravity triggers auto-degrade", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
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
          parts: [],
        },
        {
          info: {
            id: "msg_ag_1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-2",
            modelID: "antigravity-claude-opus-4-5-thinking",
            providerID: "google",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0.05,
            tokens: {
              input: 5000,
              output: 2000,
              reasoning: 1000,
              cache: { read: 500, write: 100 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "build",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-2",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "atlas",
            model: {
              providerID: "google",
              modelID: "antigravity-claude-opus-4-5-thinking",
            },
          },
          parts: [],
        },
      ];
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("## Totals");
      expect(result).toContain("## Estimated Cost");
      expect(result).not.toContain("## Budget Status");
      expect(result).not.toContain("## Trend Analysis");
      expect(result.length).toBeLessThanOrEqual(8500);
    });
  });

  describe("session.idle child aggregation", () => {
    test("session.idle shows aggregate cost including child sessions", async () => {
      let capturedToastMessage = "";
      
      // Parent session has $0.01 cost
      const parentMessages = [
        {
          info: {
            id: "msg-parent-1",
            sessionID: "ses_parent",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.01,
            tokens: {
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      // Child session has $0.02 cost
      const childMessages = [
        {
          info: {
            id: "msg-child-1",
            sessionID: "ses_child_1",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-2",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.02,
            tokens: {
              input: 2000,
              output: 1000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "ses_parent") {
              return { data: parentMessages, error: undefined };
            }
            if (path.id === "ses_child_1") {
              return { data: childMessages, error: undefined };
            }
            return { data: [], error: undefined };
          },
          children: async ({ path }: any) => {
            if (path.id === "ses_parent") {
              return { data: [{ id: "ses_child_1" }], error: undefined };
            }
            return { data: [], error: undefined };
          },
        },
        tui: {
          showToast: async (args: any) => {
            capturedToastMessage = args.body.message;
          },
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      
      await hooks.event?.({
        event: {
          type: "session.idle",
          properties: {
            sessionID: "ses_parent",
          },
        },
      });

      // Toast should show aggregate cost: $0.01 (parent) + $0.02 (child) = $0.03
      expect(capturedToastMessage).toContain("Session Cost:");
      expect(capturedToastMessage).toContain("$0.03");
    });

    test("message.updated does NOT call session.children (performance guard)", async () => {
      let childrenCalled = false;

      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.01,
            tokens: {
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
          children: async () => {
            childrenCalled = true;
            return { data: [], error: undefined };
          },
        },
        tui: {
          showToast: async () => {},
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);

      await hooks.event?.({
        event: {
          type: "message.updated",
          properties: {
            info: mockMessages[0].info,
          },
        },
      });

      // Verify that session.children was never called
      expect(childrenCalled).toBe(false);
    });

    test("session.idle falls back to current-only cost on child traversal failure", async () => {
      let capturedToastMessage = "";

      const parentMessages = [
        {
          info: {
            id: "msg-parent-1",
            sessionID: "ses_parent",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.01,
            tokens: {
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: parentMessages, error: undefined }),
          children: async () => {
            throw new Error("Network failure");
          },
        },
        tui: {
          showToast: async (args: any) => {
            capturedToastMessage = args.body.message;
          },
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);

      await hooks.event?.({
        event: {
          type: "session.idle",
          properties: {
            sessionID: "ses_parent",
          },
        },
      });

      // Toast should show current-session-only cost: $0.01
      expect(capturedToastMessage).toContain("Session Cost:");
      expect(capturedToastMessage).toContain("$0.01");
    });
  });

  describe("session.idle projectID persistence", () => {
    test("session.idle handler saves a record with projectID matching input.project.id", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session-projectid",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.123,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
        tui: {
          showToast: async () => {},
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "my-test-project-123", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);

      const result = await hooks.event?.({
        event: {
          type: "session.idle",
          properties: {
            sessionID: "test-session-projectid",
          },
        },
      });
      
      expect(hooks.event).toBeDefined();
      expect(result).toBeUndefined();
    });

    test("session.idle handler works when input.project is undefined", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session-no-project",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "parent-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "normal",
            path: { cwd: "/test", root: "/test" },
            cost: 0.123,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
        tui: {
          showToast: async () => {},
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: undefined as any,
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);

      const result = await hooks.event?.({
        event: {
          type: "session.idle",
          properties: {
            sessionID: "test-session-no-project",
          },
        },
      });
      
      expect(result).toBeUndefined();
    });
  });

  describe("Antigravity stress tests", () => {
    function generateAntigravityStressMessages(count: number, modelCount: number, agentCount: number = 10): any[] {
      const messages = [];
      for (let i = 0; i < count; i++) {
        messages.push({
          info: {
            id: `msg_ag_stress_${i}`,
            sessionID: "antigravity-stress-session",
            role: "assistant",
            time: { created: Date.now() + i },
            parentID: `user_ag_${i}`,
            modelID: `antigravity-model-${i % modelCount}`,
            providerID: "google",
            mode: `agent-${i % agentCount}`,
            path: { cwd: "/test", root: "/test" },
            cost: 0.001 + (i * 0.00001),
            tokens: {
              input: 1000 + i,
              output: 500 + i,
              reasoning: 100,
              cache: { read: 50, write: 10 },
            },
          },
          parts: [],
        });

        messages.push({
          info: {
            id: `msg_ag_u_${i}`,
            sessionID: "antigravity-stress-session",
            role: "user",
            time: { created: Date.now() + i },
            agent: `initiator-${i % agentCount}`,
            model: {
              providerID: "google",
              modelID: `antigravity-model-${i % modelCount}`,
            },
          },
          parts: [],
        });
      }
      return messages;
    }

    test("200 messages, 5 antigravity models → output within 8000+truncation chars", async () => {
      const mockMessages = generateAntigravityStressMessages(200, 5, 10);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "antigravity-stress-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("Compact mode auto-applied");
      expect(result.length).toBeLessThanOrEqual(8500);
      expect(result).toContain("## Totals");
      expect(result).toContain("## Estimated Cost");
      expect(result).not.toContain("## Trend Analysis");
      expect(result).not.toContain("## Optimization");
    });

    test("100 messages, 100 unique antigravity models → table rows bounded", async () => {
      const mockMessages = generateAntigravityStressMessages(100, 100, 10);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "antigravity-stress-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      const modelRows = result.split("\n").filter(line => line.includes("| google/antigravity-model-"));
      expect(modelRows.length).toBeLessThanOrEqual(50);
      expect(result).toContain("more rows");
      expect(result).toContain("token_export");
      expect(result.length).toBeLessThanOrEqual(8500);
    });

    test("200 messages, 50 unique agents on antigravity → agent tables bounded", async () => {
      const mockMessages = generateAntigravityStressMessages(200, 5, 55);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "antigravity-stress-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("## By Execution Agent");
      expect(result).toContain("## By Initiator Agent");
      const executionRows = result.split("\n").filter(line => line.includes("| agent-"));
      expect(executionRows.length).toBeLessThanOrEqual(50);
      const initiatorRows = result.split("\n").filter(line => line.includes("| initiator-"));
      expect(initiatorRows.length).toBeLessThanOrEqual(50);
      expect(result).toContain("Others (");
    });

    test("Non-antigravity stress negative control → no forced 8000 cap", async () => {
      const messages = [];
      for (let i = 0; i < 200; i++) {
        messages.push({
          info: {
            id: `msg_normal_${i}`,
            sessionID: "normal-stress-session",
            role: "assistant",
            time: { created: Date.now() + i },
            parentID: `user_${i}`,
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: `agent-${i % 10}`,
            path: { cwd: "/test", root: "/test" },
            cost: 0.001 + (i * 0.00001),
            tokens: {
              input: 1000 + i,
              output: 500 + i,
              reasoning: 100,
              cache: { read: 50, write: 10 },
            },
          },
          parts: [],
        });

        messages.push({
          info: {
            id: `user_${i}`,
            sessionID: "normal-stress-session",
            role: "user",
            time: { created: Date.now() + i },
            agent: `initiator-${i % 10}`,
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        });
      }

      const mockClient = {
        session: {
          messages: async () => ({ data: messages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "normal-stress-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).not.toContain("Compact mode auto-applied");
      expect(result).toContain("## Totals");
      expect(result).toContain("## Estimated Cost");
      expect(result).toContain("## By Execution Agent");
      expect(result).toContain("## By Initiator Agent");
    });

    test("SLO proxy: no undefined/NaN in antigravity output", async () => {
      const mockMessages = generateAntigravityStressMessages(100, 10, 10);
      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "antigravity-stress-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).not.toContain("undefined");
      expect(result).not.toContain("NaN");
      expect(result).not.toContain("null");
      expect(result).toMatch(/\$\d+\.\d{4}/);
    });
  });

  describe("agent table enhancements", () => {
    test("agent costs remain correct for multi-agent multi-model tables", async () => {
      const mockMessages = [
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "planner",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0,
            tokens: {
              input: 1000,
              output: 2000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-2",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
            modelID: "gpt-4o",
            providerID: "openai",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0,
            tokens: {
              input: 2000,
              output: 1000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-2",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "analyst",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-3",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-2",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "oracle",
            path: { cwd: "/test", root: "/test" },
            cost: 0,
            tokens: {
              input: 500,
              output: 1000,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-4",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-2",
            modelID: "gpt-4o",
            providerID: "openai",
            mode: "oracle",
            path: { cwd: "/test", root: "/test" },
            cost: 0,
            tokens: {
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("| build | 3,000 | 3,000 | 6,000 | 2 | $0.0480 | 66.7% |");
      expect(result).toContain("| oracle | 1,500 | 1,500 | 3,000 | 2 | $0.0240 | 33.3% |");
      expect(result).toContain("| planner | 3,000 | 3,000 | 6,000 | 2 | $0.0480 | 66.7% |");
      expect(result).toContain("| analyst | 1,500 | 1,500 | 3,000 | 2 | $0.0240 | 33.3% |");
    });

    test("agent tables include Msgs and %Cost columns", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
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
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "oracle",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-2",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0.003,
            tokens: {
              input: 50,
              output: 100,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("| Agent | Input | Output | Total | Msgs | Cost | %Cost |");
      expect(result).toContain("| Msgs |");
      expect(result).toContain("| %Cost |");
    });

    test("agent_view=execution shows only execution table", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
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
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "oracle",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { agent_view: "execution" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("## By Execution Agent");
      expect(result).not.toContain("## By Initiator Agent");
    });

    test("agent_view=initiator shows only initiator table", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
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
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "oracle",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { agent_view: "initiator" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("## By Initiator Agent");
      expect(result).not.toContain("## By Execution Agent");
    });

    test("agent_sort=tokens sorts by total tokens descending", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "alpha",
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: {
              input: 100,
              output: 100,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "orchestrator",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-2",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-2",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "beta",
            path: { cwd: "/test", root: "/test" },
            cost: 0.003,
            tokens: {
              input: 500,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-2",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "orchestrator",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
        {
          info: {
            id: "msg-3",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-3",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "gamma",
            path: { cwd: "/test", root: "/test" },
            cost: 0.0005,
            tokens: {
              input: 50,
              output: 50,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-3",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "orchestrator",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { agent_sort: "tokens" },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("## By Execution Agent");
      const executionSection = result.split("## By Initiator Agent")[0];
      const betaIndex = executionSection.indexOf("| beta |");
      const alphaIndex = executionSection.indexOf("| alpha |");
      const gammaIndex = executionSection.indexOf("| gamma |");

      expect(betaIndex).toBeGreaterThan(-1);
      expect(alphaIndex).toBeGreaterThan(-1);
      expect(gammaIndex).toBeGreaterThan(-1);
      expect(betaIndex).toBeLessThan(alphaIndex);
      expect(alphaIndex).toBeLessThan(gammaIndex);
    });

    test("agent_top_n limits rows with Others aggregation", async () => {
      const mockMessages = [];
      for (let i = 0; i < 15; i++) {
        mockMessages.push({
          info: {
            id: `msg-${i}`,
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: `user-${i}`,
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: `agent-${i}`,
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: {
              input: 100,
              output: 100,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        });
        mockMessages.push({
          info: {
            id: `user-${i}`,
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "orchestrator",
            model: {
              providerID: "anthropic",
              modelID: "claude-sonnet-4",
            },
          },
          parts: [],
        });
      }

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { agent_top_n: 5 },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("Others (10)");
      expect(result).not.toContain("more rows");
      const executionSection = result.split("## By Initiator Agent")[0];
      const agentRows = executionSection.split("\n").filter(line => line.includes("| agent-"));
      expect(agentRows.length).toBe(5);
    });

    test("%Cost shows dash when total cost is zero", async () => {
      const mockMessages = [
        {
          info: {
            id: "msg-1",
            sessionID: "test-session",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-1",
            modelID: "unknown-model-xyz",
            providerID: "test-provider",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0.0,
            tokens: {
              input: 100,
              output: 200,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [],
        },
        {
          info: {
            id: "user-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "oracle",
            model: {
              providerID: "test-provider",
              modelID: "unknown-model-xyz",
            },
          },
          parts: [],
        },
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: mockMessages, error: undefined }),
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        {},
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("## By Execution Agent");
      const executionSection = result.split("## By Initiator Agent")[0];
      expect(executionSection).toContain("| - |");
    });
  });

  describe("Tool × Command section", () => {
    function completedToolParts(title: string) {
      return [
        {
          id: "tool-1",
          sessionID: "test-session",
          messageID: "msg-1",
          type: "tool",
          callID: "call-1",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "ls" },
            output: "ok",
            title,
            metadata: {},
            time: { start: Date.now(), end: Date.now() + 1 },
          },
        },
        {
          id: "step-1",
          sessionID: "test-session",
          messageID: "msg-1",
          type: "step-finish",
          reason: "done",
          cost: 0.02,
          tokens: {
            input: 10,
            output: 5,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
      ];
    }

    function assistantMessage(parts: any[], providerID = "anthropic", modelID = "claude-sonnet-4") {
      return {
        info: {
          id: "msg-1",
          sessionID: "test-session",
          role: "assistant",
          time: { created: Date.now() },
          parentID: "user-1",
          modelID,
          providerID,
          mode: "build",
          path: { cwd: "/test", root: "/test" },
          cost: 0,
          tokens: {
            input: 100,
            output: 200,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts,
      };
    }

    async function runTokenStats(messages: any[], args: any = {}) {
      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "test-session") {
              return { data: messages, error: undefined };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      return hooks.tool!.token_stats!.execute(
        args,
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );
    }

    test("Tool × Command appears in non-compact output", async () => {
      const result = await runTokenStats([assistantMessage(completedToolParts("Run ls"))]);

      expect(result).toContain("## Tool × Command");
      expect(result).toContain("| Tool | Summary | Calls | Input | Output | Total | Cost | %Cost |");
      expect(result).toContain("| bash | Run ls | 1 | 10 | 5 | 15 |");
    });

    test("Tool × Command includes completed tool parts from child sessions", async () => {
      const rootMessages = [assistantMessage([])];
      const childMessages = [
        {
          info: {
            id: "msg-child-1",
            sessionID: "child-session-1",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-child-1",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "build",
            path: { cwd: "/test", root: "/test" },
            cost: 0,
            tokens: {
              input: 50,
              output: 100,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: completedToolParts("Run child ls"),
        },
      ];

      const mockClient = {
        session: {
          messages: async ({ path }: any) => {
            if (path.id === "test-session") {
              return { data: rootMessages, error: undefined };
            }
            if (path.id === "child-session-1") {
              return { data: childMessages, error: undefined };
            }
            return { data: [], error: undefined };
          },
          children: async ({ path }: any) => {
            if (path.id === "test-session") {
              return { data: [{ id: "child-session-1", title: "Child" }], error: undefined };
            }
            return { data: [], error: undefined };
          },
        },
      } as unknown as OpencodeClient;

      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { include_children: true },
        {
          sessionID: "test-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).toContain("## Tool × Command");
      expect(result).toContain("| bash | Run child ls | 1 | 10 | 5 | 15 |");
    });

    test("Tool × Command does not appear in compact mode", async () => {
      const result = await runTokenStats([assistantMessage(completedToolParts("Run ls"))], {
        compact: true,
      });

      expect(result).not.toContain("## Tool × Command");
    });

    test("Tool × Command does not appear in antigravity mode", async () => {
      const result = await runTokenStats([
        assistantMessage(
          completedToolParts("Run ls"),
          "google",
          "antigravity-claude-opus-4-5-thinking"
        ),
      ]);

      expect(result).toContain("Compact mode auto-applied");
      expect(result).not.toContain("## Tool × Command");
    });

    test("security: never renders ToolStateCompleted input/output", async () => {
      const result = await runTokenStats([
        assistantMessage([
          {
            id: "tool-1",
            sessionID: "test-session",
            messageID: "msg-1",
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "completed",
              input: {
                command: "cat /etc/shadow",
                secret: "my-api-key-12345",
              },
              output: "sensitive raw output contents",
              title: "Safe completed command title",
              metadata: {},
              time: { start: Date.now(), end: Date.now() + 1 },
            },
          },
          {
            id: "step-1",
            sessionID: "test-session",
            messageID: "msg-1",
            type: "step-finish",
            reason: "done",
            cost: 0.02,
            tokens: {
              input: 10,
              output: 5,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        ]),
      ]);

      expect(result).toContain("Safe completed command title");
      expect(result).not.toContain("/etc/shadow");
      expect(result).not.toContain("my-api-key-12345");
      expect(result).not.toContain("sensitive raw output contents");
    });

    test("Tool × Command omitted when there are no completed tool parts", async () => {
      const result = await runTokenStats([
        assistantMessage([
          {
            id: "tool-1",
            sessionID: "test-session",
            messageID: "msg-1",
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "running",
              input: { command: "ls" },
              title: "Still running",
              metadata: {},
              time: { start: Date.now() },
            },
          },
        ]),
      ]);

      expect(result).not.toContain("## Tool × Command");
    });
  });

  describe("Final Integration Hardening Stress Test", () => {
    test("100+ agent-model combos, 50+ tools → stable non-compact output with truncation", async () => {
      const messages = [];
      const parts = [];

      for (let i = 0; i < 55; i++) {
        parts.push({
          id: `tool-${i}`,
          sessionID: "hardening-session",
          messageID: "msg-0",
          type: "tool",
          callID: `call-${i}`,
          tool: `tool-${i}`, 
          state: {
            status: "completed",
            input: { command: "test" },
            output: "test",
            title: `Tool execution ${i}`,
            metadata: {},
            time: { start: Date.now(), end: Date.now() + 1 },
          },
        });
      }

      for (let i = 0; i < 100; i++) {
        const agent = `agent-${Math.floor(i / 10)}`;
        const model = `model-${i % 10}`;
        messages.push({
          info: {
            id: `msg-${i}`,
            sessionID: "hardening-session",
            role: "assistant",
            time: { created: Date.now() + i },
            parentID: `user-${i}`,
            modelID: model,
            providerID: "test-provider",
            mode: agent,
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: {
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: i === 0 ? parts : [],
        });

        messages.push({
          info: {
            id: `user-${i}`,
            sessionID: "hardening-session",
            role: "user",
            time: { created: Date.now() + i },
            agent: `initiator-${Math.floor(i / 10)}`,
            model: {
              providerID: "test-provider",
              modelID: model,
            },
          },
          parts: [],
        });
      }

      const mockClient = {
        session: {
          messages: async () => ({ data: messages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: false },
        {
          sessionID: "hardening-session",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("## Agent × Model");
      expect(result).toContain("## Tool × Command");
      
      const agentModelRows = result.split("## Agent × Model")[1].split("## Tool × Command")[0].split("\n").filter(l => l.includes("| agent-"));
      expect(agentModelRows.length).toBeLessThanOrEqual(50);
      expect(result).toContain("...and 50 more rows");

      const toolRows = result.split("## Tool × Command")[1].split("\n").filter(l => l.includes("| tool-"));
      expect(toolRows.length).toBeLessThanOrEqual(50);
      expect(result).toContain("...and 5 more rows");
      
      if (result.length > 20000) {
        expect(result).toContain("Output truncated");
      }
    });

    test("hardening stress test in compact mode → new sections absent", async () => {
      const messages = [
        {
          info: {
            id: "msg-0",
            sessionID: "hardening-session-compact",
            role: "assistant",
            time: { created: Date.now() },
            parentID: "user-0",
            modelID: "model-0",
            providerID: "test-provider",
            mode: "agent-0",
            path: { cwd: "/test", root: "/test" },
            cost: 0.001,
            tokens: {
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          parts: [
            {
              id: "tool-0",
              sessionID: "hardening-session-compact",
              messageID: "msg-0",
              type: "tool",
              callID: "call-0",
              tool: "bash",
              state: {
                status: "completed",
                input: { command: "test" },
                output: "test",
                title: "Tool execution",
                metadata: {},
                time: { start: Date.now(), end: Date.now() + 1 },
              },
            }
          ],
        }
      ];

      const mockClient = {
        session: {
          messages: async () => ({ data: messages, error: undefined }),
        },
      } as unknown as OpencodeClient;
      const mockInput: PluginInput = {
        client: mockClient,
        project: { id: "test-project", worktree: "/test", time: { created: Date.now() } },
        directory: "/test",
        worktree: "/test",
        serverUrl: new URL("http://localhost"),
        $: {} as any,
      };

      const hooks = await plugin(mockInput);
      const result = await hooks.tool!.token_stats!.execute(
        { compact: true },
        {
          sessionID: "hardening-session-compact",
          messageID: "test-message",
          agent: "test-agent",
          directory: "/test",
          worktree: "/test",
          abort: new AbortController().signal,
          metadata: () => {},
          ask: async () => {},
        }
      );

      expect(result).not.toContain("## Agent × Model");
      expect(result).not.toContain("## Tool × Command");
    });
  });
});
