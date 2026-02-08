# __tests__/ - Test Suite

Bun-native test suite with zero external dependencies.

## Test Files

| File | Coverage | Tests |
|------|----------|-------|
| `aggregation.test.ts` | `lib/aggregation.ts` | 6 |
| `cost-calculator.test.ts` | `lib/cost-calculator.ts` | 11 |
| `plugin.test.ts` | `plugin/index.ts` | 3 |
| `example.test.ts` | Sanity check | 1 |

**Total**: 20 tests, 47 assertions

---

## Running Tests

```bash
bun test                    # Run all
bun test aggregation        # Run specific file
bun test --watch            # Watch mode
```

---

## Mocking Pattern (MUST FOLLOW)

No external mock libraries. Use TypeScript type casting:

```typescript
// Mock the OpenCode SDK client
const mockClient = {
  session: {
    messages: async () => ({
      data: mockMessages,
      error: undefined,
    }),
  },
} as unknown as OpencodeClient;
```

### Why This Pattern?
- Zero dependencies
- Full TypeScript support
- Easy to understand and modify
- Matches SDK's actual interface structure

---

## Test Data Pattern

**Prefer inline objects over fixture imports:**

```typescript
// CORRECT: Inline test data
const messages: AssistantMessage[] = [
  {
    id: "msg_1",
    modelID: "claude-sonnet-4",
    providerID: "anthropic",
    tokens: { input: 1500, output: 800, ... },
    ...
  },
];

// AVOID: Importing from fixtures/
import data from "./fixtures/assistant-message.json";
```

### Why Inline?
- Test intent is immediately visible
- No context-switching to understand test
- Easier to modify for edge cases
- TypeScript validates structure

---

## fixtures/ Directory

Reference files showing SDK type structures. **Not imported in tests.**

| File | Shows |
|------|-------|
| `assistant-message.json` | AssistantMessage structure |
| `assistant-message-reasoning.json` | Message with reasoning tokens |
| `session-messages.json` | Full session response |
| `tool-context.json` | Tool execution context |
| `step-finish-part.json` | Step completion data |

Use these as documentation when SDK types are unclear.

---

## Edge Case Coverage (REQUIRED)

Every test file must cover:

1. **Empty state**: `[]`, `{}`, `undefined`
2. **Missing fields**: Partial objects, optional properties
3. **Unknown models**: Models not in pricing config
4. **Single item**: Arrays with one element
5. **Multiple items**: Normal operation

---

## Assertion Patterns

### Token Stats
```typescript
expect(result).toEqual({
  input: 1500,
  output: 800,
  total: 2300,
  reasoning: 0,
  cache: { read: 500, write: 200 },
});
```

### Markdown Output
```typescript
expect(result).toContain("# Token Usage Statistics");
expect(result).toContain("| Model |");
```

### Cost Calculations
```typescript
expect(result.totalCost).toBeCloseTo(0.0123, 4);
expect(result.warnings).toHaveLength(0);
```

---

## Adding New Tests

1. Create `__tests__/[module].test.ts`
2. Import from `bun:test`: `test`, `expect`, `describe`
3. Follow existing patterns for mocking and assertions
4. Cover all edge cases listed above
5. Run `bun test` to verify
