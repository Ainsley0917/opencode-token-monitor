import { describe, expect, test } from "bun:test";
import { calculateCost } from "../lib/cost-calculator";
import type { TokenStatsByModel, PriceConfig } from "../lib/types";

describe("Cost Calculator", () => {
  test("calculates cost for known model using defaults", () => {
    const stats: TokenStatsByModel = {
      "anthropic/claude-sonnet-4": {
        input: 1_000_000,
        output: 500_000,
        total: 1_500_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const result = calculateCost(stats);

    expect(result.totalCost).toBeGreaterThan(0);
    expect(result.byModel["anthropic/claude-sonnet-4"]).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(0);
  });

  test("produces warning for unknown model", () => {
    const stats: TokenStatsByModel = {
      "unknown-provider/mystery-model": {
        input: 1_000_000,
        output: 500_000,
        total: 1_500_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const result = calculateCost(stats);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("unknown-provider/mystery-model");
    expect(result.byModel["unknown-provider/mystery-model"]).toBe(0);
  });

  test("uses custom pricing config to override defaults", () => {
    const stats: TokenStatsByModel = {
      "anthropic/claude-sonnet-4": {
        input: 1_000_000,
        output: 1_000_000,
        total: 2_000_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const customPricing: PriceConfig = {
      "anthropic/claude-sonnet-4": {
        input_per_million: 10.0,
        output_per_million: 20.0,
      },
    };

    const defaultResult = calculateCost(stats);
    const customResult = calculateCost(stats, customPricing);

    // Custom pricing should produce different cost
    expect(customResult.totalCost).not.toBe(defaultResult.totalCost);
    expect(customResult.totalCost).toBe(30.0); // (1M * $10) + (1M * $20) = $30
  });

  test("calculates cost for multiple models correctly", () => {
    const stats: TokenStatsByModel = {
      "anthropic/claude-sonnet-4": {
        input: 1_000_000,
        output: 1_000_000,
        total: 2_000_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      "openai/gpt-4o": {
        input: 2_000_000,
        output: 500_000,
        total: 2_500_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const result = calculateCost(stats);

    const claudeCost = result.byModel["anthropic/claude-sonnet-4"] ?? 0;
    const gptCost = result.byModel["openai/gpt-4o"] ?? 0;
    
    expect(claudeCost).toBeGreaterThan(0);
    expect(gptCost).toBeGreaterThan(0);
    expect(result.totalCost).toBe(claudeCost + gptCost);
    expect(result.warnings).toHaveLength(0);
  });

  test("handles mix of known and unknown models", () => {
    const stats: TokenStatsByModel = {
      "anthropic/claude-sonnet-4": {
        input: 1_000_000,
        output: 500_000,
        total: 1_500_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      "custom/unknown-model": {
        input: 1_000_000,
        output: 500_000,
        total: 1_500_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const result = calculateCost(stats);

    expect(result.byModel["anthropic/claude-sonnet-4"]).toBeGreaterThan(0);
    expect(result.byModel["custom/unknown-model"]).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("custom/unknown-model");
  });

  test("handles empty stats", () => {
    const stats: TokenStatsByModel = {};

    const result = calculateCost(stats);

    expect(result.totalCost).toBe(0);
    expect(Object.keys(result.byModel)).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test("calculates cost with exact pricing formula", () => {
    const stats: TokenStatsByModel = {
      "test/model": {
        input: 2_500_000,
        output: 750_000,
        total: 3_250_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const pricing: PriceConfig = {
      "test/model": {
        input_per_million: 4.0,
        output_per_million: 12.0,
      },
    };

    const result = calculateCost(stats, pricing);

    // (2.5M * $4/M) + (0.75M * $12/M) = $10 + $9 = $19
    expect(result.totalCost).toBe(19.0);
    expect(result.byModel["test/model"]).toBe(19.0);
  });

  test("rounds costs to reasonable precision", () => {
    const stats: TokenStatsByModel = {
      "test/model": {
        input: 333_333,
        output: 666_666,
        total: 999_999,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const pricing: PriceConfig = {
      "test/model": {
        input_per_million: 3.0,
        output_per_million: 9.0,
      },
    };

    const result = calculateCost(stats, pricing);

    // Should be rounded to reasonable precision (2-6 decimal places)
    expect(result.totalCost).toBeCloseTo(6.999993, 5);
  });

  test("handles zero token counts", () => {
    const stats: TokenStatsByModel = {
      "anthropic/claude-sonnet-4": {
        input: 0,
        output: 0,
        total: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const result = calculateCost(stats);

    expect(result.totalCost).toBe(0);
    expect(result.byModel["anthropic/claude-sonnet-4"]).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  test("custom pricing can define new models", () => {
    const stats: TokenStatsByModel = {
      "custom/my-api-model": {
        input: 1_000_000,
        output: 1_000_000,
        total: 2_000_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const customPricing: PriceConfig = {
      "custom/my-api-model": {
        input_per_million: 1.5,
        output_per_million: 3.0,
      },
    };

    const result = calculateCost(stats, customPricing);

    expect(result.totalCost).toBe(4.5); // $1.50 + $3.00
    expect(result.warnings).toHaveLength(0);
  });

  test("calculates cost for specific new models (gpt-5.3-codex and antigravity-4-6)", () => {
    const stats: TokenStatsByModel = {
      "openai/gpt-5.3-codex": {
        input: 1_000_000,
        output: 1_000_000,
        total: 2_000_000,
        reasoning: 0,
        cache: { read: 1_000_000, write: 0 },
      },
      "google/antigravity-claude-opus-4-6-thinking": {
        input: 1_000_000,
        output: 1_000_000,
        total: 2_000_000,
        reasoning: 0,
        cache: { read: 1_000_000, write: 1_000_000 },
      },
    };

    const result = calculateCost(stats);

    // GPT-5.3-Codex rates (same as GPT-5.2):
    // input: 1.75, output: 14.0, cache_read: 0.175
    // 1.75 + 14.0 + 0.175 = 15.925
    expect(result.byModel["openai/gpt-5.3-codex"]).toBeCloseTo(15.925, 3);

    // Antigravity 4.6 rates:
    // input: 5.0, output: 25.0, cache_read: 0.50, cache_write: 6.25
    // 5.0 + 25.0 + 0.50 + 6.25 = 36.75
    expect(result.byModel["google/antigravity-claude-opus-4-6-thinking"]).toBeCloseTo(36.75, 2);

    expect(result.warnings).toHaveLength(0);
  });

  test("calculates cost for antigravity claude sonnet 4.5 alias", () => {
    const stats: TokenStatsByModel = {
      "google/antigravity-claude-sonnet-4-5": {
        input: 1_000_000,
        output: 1_000_000,
        total: 2_000_000,
        reasoning: 0,
        cache: { read: 1_000_000, write: 1_000_000 },
      },
    };

    const result = calculateCost(stats);

    // Same as google/antigravity-claude-sonnet-4-5-thinking:
    // input: 3.0, output: 15.0, cache_read: 0.30, cache_write: 3.75
    // 3.0 + 15.0 + 0.30 + 3.75 = 22.05
    expect(result.byModel["google/antigravity-claude-sonnet-4-5"]).toBeCloseTo(22.05, 2);
    expect(result.warnings).toHaveLength(0);
  });
});
