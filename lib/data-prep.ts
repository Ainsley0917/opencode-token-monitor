import type { Message, Part } from "@opencode-ai/sdk";
import type { AssistantMessage, PreparedMessage, UserMessage } from "./types";

type RawMessage = { info: Message; parts: Part[] };

export function prepareMessages(
  rawMessages: RawMessage[]
): { assistant: PreparedMessage[]; user: UserMessage[] } {
  const assistant: PreparedMessage[] = [];
  const user: UserMessage[] = [];

  for (const rawMessage of rawMessages || []) {
    const info = (rawMessage as { info?: Message }).info;
    const parts = (rawMessage as { parts?: Part[] }).parts || [];

    if (!info) {
      continue;
    }

    if (info.role === "assistant") {
      assistant.push({
        info: info as AssistantMessage,
        parts,
      });
      continue;
    }

    if (info.role === "user") {
      user.push(info as UserMessage);
    }
  }

  return { assistant, user };
}

export function prepareMessagesWithChildren(
  rootMessages: RawMessage[],
  childMessages: RawMessage[][]
): { assistant: PreparedMessage[]; user: UserMessage[] } {
  const mergedMessages: RawMessage[] = [...(rootMessages || [])];

  for (const child of childMessages || []) {
    mergedMessages.push(...(child || []));
  }

  return prepareMessages(mergedMessages);
}
