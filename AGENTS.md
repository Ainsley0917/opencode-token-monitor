# AGENTS.md - OpenCode Token Monitor Plugin

> AI agent knowledge base for the `opencode-token-monitor` plugin project.

## Project Overview

A Bun-based OpenCode plugin that tracks token usage and estimates costs across AI coding sessions.

**Tech Stack**: Bun + TypeScript + TDD (bun:test)  
**Plugin Type**: Tool-based (not slash command - OpenCode API limitation)  
**Entry Point**: `plugin/index.ts` → exports `token_stats` tool

---

## Directory Structure

```
/
├── plugin/index.ts          # Plugin entry - registers token_stats tool
├── lib/
│   ├── aggregation.ts       # Pure function token aggregation
│   ├── cost-calculator.ts   # Pricing logic + config loading
│   └── types.ts             # TypeScript type definitions
├── __tests__/
│   ├── *.test.ts            # Unit/integration tests
│   └── fixtures/*.json      # SDK type examples (reference only)
├── dist/plugin.js           # Bundled single-file plugin
├── pricing.json             # Default pricing config
└── docs/SDK_TYPES.md        # SDK structure documentation
```

---

## Critical Patterns

### SDK Interaction (MUST FOLLOW)

```typescript
// CORRECT: Use method-based SDK API
const response = await input.client.session.messages({
  path: { id: sessionID },
});

// WRONG: Never use generic HTTP methods
const response = await client.GET("/session/...");
```

### Message Filtering (MUST FOLLOW)

```typescript
// CORRECT: Only assistant messages have token data
const assistantMessages = messages
  .filter((msg) => msg.info.role === "assistant")
  .map((msg) => msg.info as AssistantMessage);

// WRONG: Accessing tokens on all messages
messages.forEach(msg => msg.info.tokens); // undefined for user messages
```

### Model ID Format

Always use `provider/model-id` format:
- `anthropic/claude-sonnet-4`
- `openai/gpt-4o`
- `google/gemini-2.5-pro`

---

## Forbidden Patterns

| Pattern | Why Forbidden |
|---------|---------------|
| `client.GET()` / direct HTTP | SDK uses method-based API |
| Slash commands (`/tokens`) | OpenCode API doesn't support custom slash commands |
| External pricing APIs | Performance + portability - use local `pricing.json` |
| `as any`, `@ts-ignore` | Type safety is mandatory |
| Session-level token totals | SDK doesn't provide them - must aggregate manually |

---

## Antigravity / Gemini Tool Schema Gotcha

When using Atlas / Antigravity Claude (e.g. `google/antigravity-claude-opus-4-5-thinking`) via `opencode-antigravity-auth`, tools are normalized into Gemini-style `functionDeclarations`.

- **Rule**: Do not define tools with an empty args schema (`args: {}`).
- **Why**: `opencode-antigravity-auth` treats missing/empty tool schemas as invalid and injects a placeholder schema (e.g. `_placeholder`) which increments `Tool Debug Missing` and can lead to `400 INVALID_ARGUMENT` failures in follow-up requests.
- **Fix we applied**: `token_stats` now declares an explicit schema with an optional parameter so it always has a real JSON schema.

### Required Pattern

```ts
token_stats: tool({
  description: "Show token usage statistics for the current session",
  args: {
    session_id: tool.schema
      .string()
      .optional()
      .describe("Session ID to inspect (defaults to current session)"),
  },
  async execute(args, context) {
    const sessionID = args.session_id ?? context.sessionID;
    // ...
  },
})
```

---

## Testing Conventions

**Framework**: `bun test` (zero-config, native TypeScript)

### Mocking Strategy

```typescript
// Manual interface mocking - no external mock libraries
const mockClient = {
  session: {
    messages: async () => ({ data: mockMessages, error: undefined }),
  },
} as unknown as OpencodeClient;
```

### Test Organization

- `aggregation.test.ts` → Pure function unit tests
- `cost-calculator.test.ts` → Pricing logic + edge cases
- `plugin.test.ts` → Integration tests for tool execution

### Key Test Patterns

1. **Zero-state coverage**: Empty sessions, unknown models, missing fields
2. **Markdown assertions**: Verify output format includes headers/tables
3. **Inline test data**: Prefer inline objects over JSON fixture imports

---

## Build & Deploy

```bash
# Development
bun test              # Run all tests
bun run typecheck     # Type checking only

# Build
bun run build         # Output: dist/plugin.js

# Install
cp dist/plugin.js ~/.opencode/plugins/token-monitor.js
```

---

## Pricing Configuration

Search order: `./pricing.json` → `~/.opencode/pricing.json` → `~/.config/opencode/pricing.json`

```json
{
  "anthropic/claude-sonnet-4": {
    "input_per_million": 3.0,
    "output_per_million": 15.0,
    "cache_read_per_million": 0.30,
    "cache_write_per_million": 3.75
  }
}
```

---

## Type Definitions

### Core Types (`lib/types.ts`)

```typescript
type AssistantMessage = {
  role: "assistant";
  modelID: string;
  providerID: string;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
  cost: number;
};

type TokenStats = {
  input: number;
  output: number;
  total: number;
  reasoning: number;
  cache: { read: number; write: number };
};

type ModelPricing = {
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million?: number;
  cache_write_per_million?: number;
};
```

---

## Environment Notes

- **Bun module resolution**: Uses `module: "Preserve"` and `moduleResolution: "bundler"`
- **Single-file deployment**: Bundle with `bun build` before installing to OpenCode
- **External dependencies**: `@opencode-ai/plugin` and `@opencode-ai/sdk` are externalized in build

---

## Future Roadmap

| Feature | Priority | Status |
|---------|----------|--------|
| Real-time TUI display | High | Planned |
| History persistence (JSON) | High | ✅ Done |
| Budget alerts & Notifications | High | ✅ Done |
| Project-scoped Analytics | High | ✅ Done |
| Per-agent breakdown | Medium | ✅ Done |
| Agent × Model cross-breakdown | Medium | ✅ Done |
| NPM publish | Low | Planned |
