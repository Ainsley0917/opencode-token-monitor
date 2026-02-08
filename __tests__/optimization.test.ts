import { describe, test, expect } from "bun:test";
import type { TokenStats, TokenStatsByModel, PriceConfig } from "../lib/types";
import {
  analyzeModelCosts,
  analyzeCacheEfficiency,
  analyzeReasoningUsage,
  generateOptimizationSuggestions,
  formatOptimizationSection,
  type Suggestion,
} from "../lib/optimization";

describe("analyzeModelCosts", () => {
  const pricing: PriceConfig = {
    "anthropic/claude-opus-4": {
      input_per_million: 15.0,
      output_per_million: 75.0,
    },
    "anthropic/claude-sonnet-4": {
      input_per_million: 3.0,
      output_per_million: 15.0,
    },
    "anthropic/claude-haiku-4.5": {
      input_per_million: 1.0,
      output_per_million: 5.0,
    },
  };

  test("suggests alternative when top model accounts for >70% of cost", () => {
    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 100_000,
        output: 50_000,
        total: 150_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      "anthropic/claude-sonnet-4": {
        input: 10_000,
        output: 5_000,
        total: 15_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = analyzeModelCosts(byModel, pricing);
    
    expect(suggestions.length).toBe(1);
    const suggestion = suggestions[0]!;
    expect(suggestion.severity).toBe("warning");
    expect(suggestion.message).toContain("anthropic/claude-opus-4");
    expect(suggestion.message).toMatch(/\d+%/);
    expect(suggestion.message).toContain("$");
    expect(suggestion.metric).toBe("model_cost_distribution");
  });

  test("returns empty array when no model exceeds 70% threshold", () => {
    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 10_000,
        output: 5_000,
        total: 15_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      "anthropic/claude-sonnet-4": {
        input: 50_000,
        output: 25_000,
        total: 75_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = analyzeModelCosts(byModel, pricing);
    expect(suggestions).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    const suggestions = analyzeModelCosts({}, pricing);
    expect(suggestions).toEqual([]);
  });
});

describe("analyzeCacheEfficiency", () => {
  test("suggests review when write/read ratio is high and writes > 1000", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 500,
        write: 2000, // 4:1 ratio
      },
    };

    const suggestions = analyzeCacheEfficiency(stats);
    
    expect(suggestions.length).toBe(1);
    const suggestion = suggestions[0]!;
    expect(suggestion.severity).toBe("warning");
    expect(suggestion.message).toContain("write/read ratio");
    expect(suggestion.message).toMatch(/\d+:\d+/);
    expect(suggestion.metric).toBe("cache_efficiency");
  });

  test("returns empty when write/read ratio is acceptable", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 5000,
        write: 2000, // 0.4:1 ratio (read > write)
      },
    };

    const suggestions = analyzeCacheEfficiency(stats);
    expect(suggestions).toEqual([]);
  });

  test("returns empty when cache writes are low even with high ratio", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 10,
        write: 100, // High ratio but low absolute count
      },
    };

    const suggestions = analyzeCacheEfficiency(stats);
    expect(suggestions).toEqual([]);
  });

  test("handles zero cache reads gracefully", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 0,
        write: 2000,
      },
    };

    const suggestions = analyzeCacheEfficiency(stats);
    expect(suggestions.length).toBe(1);
    const suggestion = suggestions[0]!;
    expect(suggestion.message).toContain("write/read ratio");
  });
});

describe("analyzeReasoningUsage", () => {
  test("suggests non-reasoning model when reasoning > 50% of output", () => {
    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 10_000,
        output: 10_000,
        total: 20_000,
        reasoning: 6_000, // 60% of output
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = analyzeReasoningUsage(byModel);
    
    expect(suggestions.length).toBe(1);
    const suggestion = suggestions[0]!;
    expect(suggestion.severity).toBe("info");
    expect(suggestion.message).toContain("anthropic/claude-opus-4");
    expect(suggestion.message).toContain("reasoning tokens");
    expect(suggestion.message).toMatch(/\d+%/);
    expect(suggestion.metric).toBe("reasoning_usage");
  });

  test("returns empty when reasoning is < 50% of output", () => {
    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 10_000,
        output: 10_000,
        total: 20_000,
        reasoning: 4_000, // 40% of output
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = analyzeReasoningUsage(byModel);
    expect(suggestions).toEqual([]);
  });

  test("handles multiple models and flags all that exceed threshold", () => {
    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 10_000,
        output: 10_000,
        total: 20_000,
        reasoning: 6_000, // 60% of output
        cache: { read: 0, write: 0 },
      },
      "anthropic/claude-sonnet-4": {
        input: 10_000,
        output: 10_000,
        total: 20_000,
        reasoning: 3_000, // 30% of output
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = analyzeReasoningUsage(byModel);
    expect(suggestions.length).toBe(1);
    const suggestion = suggestions[0]!;
    expect(suggestion.message).toContain("anthropic/claude-opus-4");
  });

  test("handles zero output gracefully", () => {
    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 10_000,
        output: 0,
        total: 10_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = analyzeReasoningUsage(byModel);
    expect(suggestions).toEqual([]);
  });
});

describe("generateOptimizationSuggestions", () => {
  const pricing: PriceConfig = {
    "anthropic/claude-opus-4": {
      input_per_million: 15.0,
      output_per_million: 75.0,
    },
    "anthropic/claude-sonnet-4": {
      input_per_million: 3.0,
      output_per_million: 15.0,
    },
  };

  test("combines suggestions from all analyzers", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 500,
        write: 2000,
      },
    };

    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 90_000,
        output: 45_000,
        total: 135_000,
        reasoning: 30_000, // 66% of output
        cache: { read: 500, write: 2000 },
      },
      "anthropic/claude-sonnet-4": {
        input: 10_000,
        output: 5_000,
        total: 15_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = generateOptimizationSuggestions(stats, byModel, pricing);
    
    // Should have warnings from model cost and cache, plus info from reasoning
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  test("limits output to max 3 suggestions", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 100,
        write: 5000,
      },
    };

    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 95_000,
        output: 48_000,
        total: 143_000,
        reasoning: 30_000,
        cache: { read: 100, write: 5000 },
      },
      "anthropic/claude-sonnet-4": {
        input: 5_000,
        output: 2_000,
        total: 7_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = generateOptimizationSuggestions(stats, byModel, pricing);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  test("sorts warnings before info", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 500,
        write: 2000,
      },
    };

    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 90_000,
        output: 45_000,
        total: 135_000,
        reasoning: 30_000,
        cache: { read: 500, write: 2000 },
      },
      "anthropic/claude-sonnet-4": {
        input: 10_000,
        output: 5_000,
        total: 15_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions = generateOptimizationSuggestions(stats, byModel, pricing);
    
    if (suggestions.length > 1) {
      const firstWarningIndex = suggestions.findIndex((s: Suggestion) => s.severity === "warning");
      const firstInfoIndex = suggestions.findIndex((s: Suggestion) => s.severity === "info");
      
      if (firstWarningIndex !== -1 && firstInfoIndex !== -1) {
        expect(firstWarningIndex).toBeLessThan(firstInfoIndex);
      }
    }
  });

  test("returns empty array when no issues detected", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 5000,
        write: 1000,
      },
    };

    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 10_000,
        output: 5_000,
        total: 15_000,
        reasoning: 0,
        cache: { read: 500, write: 100 },
      },
      "anthropic/claude-sonnet-4": {
        input: 50_000,
        output: 25_000,
        total: 75_000,
        reasoning: 0,
        cache: { read: 2500, write: 500 },
      },
    };

    const suggestions = generateOptimizationSuggestions(stats, byModel, pricing);
    expect(suggestions).toEqual([]);
  });

  test("produces deterministic ordering for same input", () => {
    const stats: TokenStats = {
      input: 100_000,
      output: 50_000,
      total: 150_000,
      reasoning: 0,
      cache: {
        read: 500,
        write: 2000,
      },
    };

    const byModel: TokenStatsByModel = {
      "anthropic/claude-opus-4": {
        input: 90_000,
        output: 45_000,
        total: 135_000,
        reasoning: 30_000,
        cache: { read: 500, write: 2000 },
      },
      "anthropic/claude-sonnet-4": {
        input: 10_000,
        output: 5_000,
        total: 15_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const suggestions1 = generateOptimizationSuggestions(stats, byModel, pricing);
    const suggestions2 = generateOptimizationSuggestions(stats, byModel, pricing);
    
    expect(suggestions1).toEqual(suggestions2);
  });
});

describe("formatOptimizationSection", () => {
  test("formats suggestions as markdown bullet list", () => {
    const suggestions: Suggestion[] = [
      {
        id: "model_cost_1",
        message: "Model X accounts for 85% of costs. Consider alternatives.",
        metric: "model_cost_distribution",
        severity: "warning",
      },
      {
        id: "cache_1",
        message: "Cache write/read ratio is 4:1. Review caching strategy.",
        metric: "cache_efficiency",
        severity: "warning",
      },
    ];

    const output = formatOptimizationSection(suggestions);
    
    expect(output).toContain("## Cost Optimization");
    expect(output).toContain("- Model X accounts for 85% of costs");
    expect(output).toContain("- Cache write/read ratio is 4:1");
  });

  test("returns empty string for empty suggestions", () => {
    const output = formatOptimizationSection([]);
    expect(output).toBe("");
  });

  test("output includes newlines between items", () => {
    const suggestions: Suggestion[] = [
      {
        id: "test_1",
        message: "First suggestion",
        metric: "test",
        severity: "info",
      },
      {
        id: "test_2",
        message: "Second suggestion",
        metric: "test",
        severity: "info",
      },
    ];

    const output = formatOptimizationSection(suggestions);
    expect(output.split("\n").length).toBeGreaterThan(2);
  });
});
