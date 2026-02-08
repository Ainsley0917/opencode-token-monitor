# OpenCode SDK Type Reference

This document details the TypeScript type structures discovered in `@opencode-ai/plugin` and `@opencode-ai/sdk` that are critical for implementing the token monitoring tool.

---

## 1. Tool Execution Context

**Source:** `@opencode-ai/plugin/dist/tool.d.ts`

Plugin tools receive a `ToolContext` parameter that provides access to the current session:

```typescript
export type ToolContext = {
    sessionID: string;
    messageID: string;
    agent: string;
    directory: string;
    worktree: string;
    abort: AbortSignal;
    metadata(input: { title?: string; metadata?: { [key: string]: any } }): void;
    ask(input: AskInput): Promise<void>;
};
```

**Key Findings:**
- ✅ **Session ID is directly available** via `context.sessionID`
- ✅ Message ID is available via `context.messageID`
- ✅ Agent name is available via `context.agent`

**Decision:** The tool can access the current session ID from the `ToolContext` parameter during execution. No need for environment variables or SDK queries to discover the session ID.

---

## 2. Token Usage Structure

**Source:** `@opencode-ai/sdk/dist/gen/types.gen.d.ts` (lines 98-127)

Token usage data is stored at the **AssistantMessage level**:

```typescript
export type AssistantMessage = {
    id: string;
    sessionID: string;
    role: "assistant";
    time: {
        created: number;
        completed?: number;
    };
    error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError;
    parentID: string;
    modelID: string;          // ← Model ID here
    providerID: string;       // ← Provider ID here
    mode: string;
    path: {
        cwd: string;
        root: string;
    };
    summary?: boolean;
    cost: number;             // ← Calculated cost (if available)
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
```

**Key Findings:**
- ✅ Token counts are at **message level** (not session or part level)
- ✅ Token structure: `{ input, output, reasoning, cache: { read, write } }`
- ✅ Model ID is stored as `modelID` and `providerID` on each message
- ✅ A `cost` field exists (pre-calculated by SDK if provider supports it)
- ✅ Only `AssistantMessage` has tokens; `UserMessage` does not

---

## 3. Step-Level Token Tracking

**Source:** `@opencode-ai/sdk/dist/gen/types.gen.d.ts` (lines 282-299)

For multi-step agents, token usage is also tracked at the **Part level** via `StepFinishPart`:

```typescript
export type StepFinishPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "step-finish";
    reason: string;
    snapshot?: string;
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
};
```

**Key Findings:**
- ✅ Same token structure as `AssistantMessage`
- ✅ Allows tracking token usage **per agentic step** within a message
- ⚠️ For MVP, we aggregate message-level tokens (simpler)
- 📌 Future enhancement: Provide per-step breakdowns

---

## 4. SDK Client Methods

**Source:** `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts`

The SDK client exposes methods to query sessions and messages:

```typescript
// Get session info
GET /session/{id}

// List all messages in a session
GET /session/{id}/message?limit={number}
Response: Array<{ info: Message; parts: Part[] }>

// Get a specific message
GET /session/{id}/message/{messageID}
Response: { info: Message; parts: Part[] }
```

**Key Findings:**
- ✅ `client.session.messages({ path: { id } })` returns all messages with parts (supported SDK API)
- ✅ Each message is typed as `{ info: Message; parts: Part[] }`
- ✅ `Message` is a union: `UserMessage | AssistantMessage`
- ✅ Type guard needed: Check `message.info.role === "assistant"` before accessing tokens

---

## 5. Implementation Strategy

### Runtime Data Access

**Chosen Strategy:** Query SDK for messages in the current session

1. Tool receives `context.sessionID` from `ToolContext`
2. Call `client.session.messages({ path: { id: sessionID } })` to fetch all messages
3. Filter for `AssistantMessage` (only these have token data)
4. Aggregate token counts across all assistant messages

**Why not use session-level aggregation?**
- ❌ No `Session.tokens` field exists in SDK types
- ✅ Message-level aggregation is the correct approach

### Type Safety

Use TypeScript type guards:

```typescript
function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === "assistant";
}
```

---

## 6. Token Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `tokens.input` | `number` | Input tokens consumed |
| `tokens.output` | `number` | Output tokens generated |
| `tokens.reasoning` | `number` | Reasoning/thinking tokens (if model supports it, e.g., o1) |
| `tokens.cache.read` | `number` | Tokens read from cache |
| `tokens.cache.write` | `number` | Tokens written to cache |
| `cost` | `number` | Pre-calculated cost (if provider supplies pricing) |

**Important:** 
- `reasoning` tokens are typically **not included** in `input` or `output` counts
- Cache tokens affect billing differently (typically cheaper)

---

## 7. Model Identification

Model information is available at **two levels**:

### Message Level
```typescript
AssistantMessage.modelID: string;      // e.g., "claude-sonnet-4"
AssistantMessage.providerID: string;   // e.g., "anthropic"
```

### Part Level (for multi-step)
Not tracked at part level; inherit from parent message.

**Strategy:** Group token stats by `providerID/modelID` tuple for breakdown reporting.

---

## 8. Example JSON Fixtures

See `__tests__/fixtures/` for complete examples matching these types.

---

## Next Steps

- [x] Document SDK types
- [ ] Create test fixtures with realistic token data
- [ ] Implement aggregation logic
- [ ] Add model-level breakdown
- [ ] Support cost calculation (if custom pricing needed)
