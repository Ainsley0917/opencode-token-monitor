# lib/ - Core Library Modules

Pure function implementations for token aggregation and cost calculation.

## Module Overview

| File | Purpose | Pure? |
|------|---------|-------|
| `aggregation.ts` | Token counting across messages | ✅ Yes |
| `cost-calculator.ts` | Pricing lookup + cost math | ✅ Yes (IO in loader) |
| `types.ts` | TypeScript type definitions | N/A |

---

## aggregation.ts

### Functions

```typescript
aggregateTokens(messages: AssistantMessage[]): TokenStats
```
- Sums all token fields across messages
- Returns `{ input, output, total, reasoning, cache: { read, write } }`
- Handles missing/undefined fields gracefully (treats as 0)

```typescript
aggregateTokensByModel(messages: AssistantMessage[]): TokenStatsByModel
```
- Groups tokens by `${providerID}/${modelID}` key
- Returns map of model keys to TokenStats

### Key Pattern: Defensive Field Access

```typescript
// Always guard against missing nested fields
const tokens = msg.tokens || {};
const cache = tokens.cache || {};
acc.input += tokens.input || 0;
```

---

## cost-calculator.ts

### Functions

```typescript
loadPricingConfig(configPath?: string): PriceConfig
```
- Search order: `./pricing.json` → `~/.opencode/pricing.json` → `~/.config/opencode/pricing.json`
- Returns empty object if no config found (falls back to defaults)

```typescript
calculateCost(stats: TokenStatsByModel, customPricing?: PriceConfig): CostResult
```
- Merges custom pricing over DEFAULT_PRICING
- Calculates: `(tokens / 1_000_000) * price_per_million`
- Handles cache read/write costs separately
- Adds warnings for unknown models

### DEFAULT_PRICING

Built-in pricing for major models:
- Anthropic: Claude 3.5, 4, 4.5 series
- OpenAI: GPT-4o, GPT-5.x, o1, o3, o4-mini
- Google: Gemini 1.5, 2.0, 2.5, Antigravity variants

### Cost Formula

```typescript
inputCost = (input / 1_000_000) * input_per_million
outputCost = (output / 1_000_000) * output_per_million
cacheReadCost = (cache.read / 1_000_000) * cache_read_per_million
cacheWriteCost = (cache.write / 1_000_000) * cache_write_per_million
totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost
```

---

## types.ts

### Core Types

| Type | Description |
|------|-------------|
| `AssistantMessage` | SDK message with tokens, cost, model info |
| `TokenStats` | Aggregated token counts |
| `TokenStatsByModel` | Map of model key → TokenStats |
| `ModelPricing` | Per-million pricing for a model |
| `PriceConfig` | Map of model key → ModelPricing |
| `CostResult` | Total cost, per-model costs, warnings |

---

## Adding New Functionality

1. **New aggregation**: Add pure function, export from `aggregation.ts`
2. **New pricing field**: Update `ModelPricing` type, handle in `calculateCost`
3. **New model**: Add to `DEFAULT_PRICING` or user's `pricing.json`

## Testing

All functions have corresponding tests in `__tests__/`:
- `aggregation.test.ts` - 6 tests
- `cost-calculator.test.ts` - 11 tests
