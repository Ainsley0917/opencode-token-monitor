import { describe, expect, test } from "bun:test";
import type { Message, Part } from "@opencode-ai/sdk";
import { prepareMessages, prepareMessagesWithChildren } from "../lib/data-prep";

describe("data prep", () => {
  test("empty messages returns empty assistant and user arrays", () => {
    const result = prepareMessages([]);

    expect(result).toEqual({ assistant: [], user: [] });
  });

  test("filters assistant vs user messages correctly", () => {
    const rawMessages: Array<{ info: Message; parts: Part[] }> = [
      {
        info: {
          id: "assistant-1",
          sessionID: "ses-1",
          role: "assistant",
          time: { created: 1 },
          parentID: "user-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/tmp", root: "/tmp" },
          cost: 0,
          tokens: {
            input: 10,
            output: 20,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        } as Message,
        parts: [],
      },
      {
        info: {
          id: "user-1",
          sessionID: "ses-1",
          role: "user",
          time: { created: 1 },
          agent: "sisyphus",
          model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
        } as Message,
        parts: [],
      },
    ];

    const result = prepareMessages(rawMessages);

    expect(result.assistant).toHaveLength(1);
    expect(result.user).toHaveLength(1);
    expect(result.assistant[0]?.info.id).toBe("assistant-1");
    expect(result.user[0]?.id).toBe("user-1");
  });

  test("preserves parts for assistant messages", () => {
    const assistantParts: Part[] = [
      {
        id: "part-1",
        sessionID: "ses-1",
        messageID: "assistant-1",
        type: "text",
        text: "hello",
      },
    ];

    const rawMessages: Array<{ info: Message; parts: Part[] }> = [
      {
        info: {
          id: "assistant-1",
          sessionID: "ses-1",
          role: "assistant",
          time: { created: 1 },
          parentID: "user-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/tmp", root: "/tmp" },
          cost: 0,
          tokens: {
            input: 10,
            output: 20,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        } as Message,
        parts: assistantParts,
      },
    ];

    const result = prepareMessages(rawMessages);

    expect(result.assistant).toHaveLength(1);
    expect(result.assistant[0]?.parts).toEqual(assistantParts);
  });

  test("defaults missing or undefined parts to empty array", () => {
    const rawMessages = [
      {
        info: {
          id: "assistant-1",
          sessionID: "ses-1",
          role: "assistant",
          time: { created: 1 },
          parentID: "user-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/tmp", root: "/tmp" },
          cost: 0,
          tokens: {
            input: 10,
            output: 20,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        } as Message,
        parts: undefined,
      },
    ] as Array<{ info: Message; parts: Part[] | undefined }>;

    const result = prepareMessages(rawMessages as Array<{ info: Message; parts: Part[] }>);

    expect(result.assistant).toHaveLength(1);
    expect(result.assistant[0]?.parts).toEqual([]);
  });

  test("prepareMessagesWithChildren flattens root and child messages", () => {
    const rootMessages: Array<{ info: Message; parts: Part[] }> = [
      {
        info: {
          id: "assistant-root",
          sessionID: "root",
          role: "assistant",
          time: { created: 1 },
          parentID: "user-root",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/tmp", root: "/tmp" },
          cost: 0,
          tokens: {
            input: 1,
            output: 1,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        } as Message,
        parts: [],
      },
    ];

    const childMessages: Array<Array<{ info: Message; parts: Part[] }>> = [
      [
        {
          info: {
            id: "assistant-child-1",
            sessionID: "child-1",
            role: "assistant",
            time: { created: 1 },
            parentID: "user-child-1",
            modelID: "gpt-5.2",
            providerID: "openai",
            mode: "build",
            path: { cwd: "/tmp", root: "/tmp" },
            cost: 0,
            tokens: {
              input: 2,
              output: 2,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          } as Message,
          parts: [],
        },
      ],
      [
        {
          info: {
            id: "user-child-2",
            sessionID: "child-2",
            role: "user",
            time: { created: 1 },
            agent: "oracle",
            model: { providerID: "openai", modelID: "gpt-5.2" },
          } as Message,
          parts: [],
        },
      ],
    ];

    const result = prepareMessagesWithChildren(rootMessages, childMessages);

    expect(result.assistant).toHaveLength(2);
    expect(result.user).toHaveLength(1);
    expect(result.assistant.map((msg) => msg.info.id)).toEqual([
      "assistant-root",
      "assistant-child-1",
    ]);
  });

  test("ignores messages with missing info and separates mixed roles", () => {
    const rawMessages = [
      {
        info: {
          id: "assistant-1",
          sessionID: "ses-1",
          role: "assistant",
          time: { created: 1 },
          parentID: "user-1",
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          mode: "build",
          path: { cwd: "/tmp", root: "/tmp" },
          cost: 0,
          tokens: {
            input: 10,
            output: 20,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [],
      },
      {
        info: {
          id: "user-1",
          sessionID: "ses-1",
          role: "user",
          time: { created: 1 },
          agent: "oracle",
          model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
        },
        parts: [],
      },
      {
        info: undefined,
        parts: [],
      },
    ] as Array<{ info?: Message; parts?: Part[] }>;

    const result = prepareMessages(rawMessages as Array<{ info: Message; parts: Part[] }>);

    expect(result.assistant).toHaveLength(1);
    expect(result.user).toHaveLength(1);
  });
});
