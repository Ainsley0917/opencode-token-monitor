import type { TokenStats, TokenStatsByModel, PriceConfig } from "./types";
import { calculateCost } from "./cost-calculator";

export type Suggestion = {
  id: string;
  message: string;
  metric: string;
  severity: "info" | "warning";
};

export function analyzeModelCosts(
  byModel: TokenStatsByModel,
  pricing: PriceConfig
): Suggestion[] {
  const costResult = calculateCost(byModel, pricing);
  const { totalCost, byModel: modelCosts } = costResult;

  if (totalCost === 0 || Object.keys(modelCosts).length === 0) {
    return [];
  }

  const modelCostEntries = Object.entries(modelCosts).sort(
    ([, costA], [, costB]) => costB - costA
  );

  const topEntry = modelCostEntries[0];
  if (!topEntry) {
    return [];
  }

  const topModel = topEntry[0];
  const topCost = topEntry[1];
  const percentage = (topCost / totalCost) * 100;

  if (percentage > 70) {
    return [
      {
        id: "model_cost_high_concentration",
        message: `${topModel} accounts for ${percentage.toFixed(0)}% ($${topCost.toFixed(4)}) of costs. Consider lower-cost alternatives.`,
        metric: "model_cost_distribution",
        severity: "warning",
      },
    ];
  }

  return [];
}

export function analyzeCacheEfficiency(stats: TokenStats): Suggestion[] {
  const { cache } = stats;

  if (cache.write < 1000) {
    return [];
  }

  const ratio = cache.read === 0 ? Infinity : cache.write / cache.read;

  if (ratio > 2) {
    const readPart = cache.read === 0 ? "0" : "1";
    const writePart = cache.read === 0 ? "∞" : Math.round(ratio).toString();
    
    return [
      {
        id: "cache_write_heavy",
        message: `Cache write/read ratio is ${writePart}:${readPart} (${cache.write.toLocaleString()} writes, ${cache.read.toLocaleString()} reads). Review caching strategy.`,
        metric: "cache_efficiency",
        severity: "warning",
      },
    ];
  }

  return [];
}

export function analyzeReasoningUsage(byModel: TokenStatsByModel): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const [modelKey, stats] of Object.entries(byModel)) {
    if (stats.output === 0) {
      continue;
    }

    const reasoningPercentage = (stats.reasoning / stats.output) * 100;

    if (reasoningPercentage > 50) {
      suggestions.push({
        id: `reasoning_heavy_${modelKey.replace(/[^a-z0-9]/gi, "_")}`,
        message: `${modelKey} uses ${reasoningPercentage.toFixed(0)}% reasoning tokens (${stats.reasoning.toLocaleString()} of ${stats.output.toLocaleString()} output). Consider non-reasoning model for simpler tasks.`,
        metric: "reasoning_usage",
        severity: "info",
      });
    }
  }

  return suggestions;
}

export function generateOptimizationSuggestions(
  stats: TokenStats,
  byModel: TokenStatsByModel,
  pricing: PriceConfig
): Suggestion[] {
  const all = [
    ...analyzeModelCosts(byModel, pricing),
    ...analyzeCacheEfficiency(stats),
    ...analyzeReasoningUsage(byModel),
  ];

  const sorted = all.sort((a, b) => {
    const severityOrder = { warning: 0, info: 1 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return a.id.localeCompare(b.id);
  });

  return sorted.slice(0, 3);
}

export function formatOptimizationSection(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) {
    return "";
  }

  const header = "## Cost Optimization\n\n";
  const items = suggestions.map((s) => `- ${s.message}`).join("\n");

  return header + items;
}
