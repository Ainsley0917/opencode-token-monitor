import type { TokenStatsByModel, PriceConfig, CostResult, ModelPricing } from "./types";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const DEFAULT_PRICING: PriceConfig = {
  // Anthropic Claude 4 系列
  "anthropic/claude-sonnet-4": {
    input_per_million: 3.0,
    output_per_million: 15.0,
    cache_read_per_million: 0.30,
    cache_write_per_million: 3.75,
  },
  "anthropic/claude-opus-4": {
    input_per_million: 15.0,
    output_per_million: 75.0,
    cache_read_per_million: 1.50,
    cache_write_per_million: 18.75,
  },
  // Anthropic Claude 4.5 系列 (最新)
  "anthropic/claude-opus-4.5": {
    input_per_million: 5.0,
    output_per_million: 25.0,
    cache_read_per_million: 0.50,
    cache_write_per_million: 6.25,
  },
  "anthropic/claude-sonnet-4.5": {
    input_per_million: 3.0,
    output_per_million: 15.0,
    cache_read_per_million: 0.30,
    cache_write_per_million: 3.75,
  },
  "anthropic/claude-haiku-4.5": {
    input_per_million: 1.0,
    output_per_million: 5.0,
    cache_read_per_million: 0.10,
    cache_write_per_million: 1.25,
  },
  // Anthropic Claude 3.5 系列
  "anthropic/claude-3-5-sonnet": {
    input_per_million: 3.0,
    output_per_million: 15.0,
    cache_read_per_million: 0.30,
    cache_write_per_million: 3.75,
  },
  "anthropic/claude-3-5-haiku": {
    input_per_million: 0.80,
    output_per_million: 4.0,
    cache_read_per_million: 0.08,
    cache_write_per_million: 1.0,
  },
  // Google Antigravity (按 Anthropic Claude 4.5 价格)
  "google/antigravity-claude-opus-4-5-thinking": {
    input_per_million: 5.0,
    output_per_million: 25.0,
    cache_read_per_million: 0.50,
    cache_write_per_million: 6.25,
  },
  "google/antigravity-claude-opus-4-6-thinking": {
    input_per_million: 5.0,
    output_per_million: 25.0,
    cache_read_per_million: 0.50,
    cache_write_per_million: 6.25,
  },
  "google/antigravity-claude-sonnet-4-5-thinking": {
    input_per_million: 3.0,
    output_per_million: 15.0,
    cache_read_per_million: 0.30,
    cache_write_per_million: 3.75,
  },
  "google/antigravity-claude-sonnet-4-5": {
    input_per_million: 3.0,
    output_per_million: 15.0,
    cache_read_per_million: 0.30,
    cache_write_per_million: 3.75,
  },
  // OpenAI GPT 系列
  "openai/gpt-4o": {
    input_per_million: 2.5,
    output_per_million: 10.0,
    cache_read_per_million: 1.25,
  },
  "openai/gpt-4-turbo": {
    input_per_million: 10.0,
    output_per_million: 30.0,
  },
  "openai/gpt-5.2": {
    input_per_million: 1.75,
    output_per_million: 14.0,
    cache_read_per_million: 0.175,
  },
  "openai/gpt-5.3-codex": {
    input_per_million: 1.75,
    output_per_million: 14.0,
    cache_read_per_million: 0.175,
  },
  "openai/gpt-5-mini": {
    input_per_million: 0.25,
    output_per_million: 2.0,
    cache_read_per_million: 0.025,
  },
  // OpenAI o 系列 (推理模型)
  "openai/o1": {
    input_per_million: 15.0,
    output_per_million: 60.0,
    cache_read_per_million: 7.50,
  },
  "openai/o3": {
    input_per_million: 2.0,
    output_per_million: 8.0,
    cache_read_per_million: 0.50,
  },
  "openai/o4-mini": {
    input_per_million: 1.10,
    output_per_million: 4.40,
    cache_read_per_million: 0.275,
  },
  // Google Gemini 系列
  "google/gemini-3-flash": {
    input_per_million: 0.50,
    output_per_million: 3.0,
    cache_read_per_million: 0.05,
  },
  "google/antigravity-gemini-3-flash": {
    input_per_million: 0.50,
    output_per_million: 3.0,
    cache_read_per_million: 0.05,
  },
  "google/gemini-pro": {
    input_per_million: 1.25,
    output_per_million: 10.0,
    cache_read_per_million: 0.125,
  },
  "google/gemini-1.5-pro": {
    input_per_million: 1.25,
    output_per_million: 10.0,
    cache_read_per_million: 0.125,
  },
  "google/gemini-1.5-flash": {
    input_per_million: 0.15,
    output_per_million: 0.60,
    cache_read_per_million: 0.015,
  },
  "google/gemini-2.0-flash": {
    input_per_million: 0.10,
    output_per_million: 0.40,
  },
  "google/gemini-2.5-pro": {
    input_per_million: 1.25,
    output_per_million: 10.0,
    cache_read_per_million: 0.125,
  },
};

import { homedir } from "os";

export function loadPricingConfig(configPath?: string): PriceConfig {
  const searchPaths = configPath 
    ? [configPath]
    : [
        join(process.cwd(), "pricing.json"),
        join(homedir(), ".opencode", "pricing.json"),
        join(homedir(), ".config", "opencode", "pricing.json"),
      ];
  
  for (const path of searchPaths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        return JSON.parse(content) as PriceConfig;
      } catch (error) {
        console.warn(`Failed to load pricing config from ${path}:`, error);
      }
    }
  }
  
  return {};
}

export function calculateCost(
  stats: TokenStatsByModel,
  customPricing?: PriceConfig
): CostResult {
  const pricing = { ...DEFAULT_PRICING, ...customPricing };
  const byModel: { [modelKey: string]: number } = {};
  const warnings: string[] = [];
  let totalCost = 0;

  for (const [modelKey, tokenStats] of Object.entries(stats)) {
    const modelPricing = pricing[modelKey];

    if (!modelPricing) {
      warnings.push(
        `No pricing data available for model: ${modelKey}. Cost set to $0.`
      );
      byModel[modelKey] = 0;
      continue;
    }

    const inputCost = (tokenStats.input / 1_000_000) * modelPricing.input_per_million;
    const outputCost = (tokenStats.output / 1_000_000) * modelPricing.output_per_million;
    const cacheReadCost = modelPricing.cache_read_per_million 
      ? (tokenStats.cache.read / 1_000_000) * modelPricing.cache_read_per_million 
      : 0;
    const cacheWriteCost = modelPricing.cache_write_per_million 
      ? (tokenStats.cache.write / 1_000_000) * modelPricing.cache_write_per_million 
      : 0;
    const modelCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    byModel[modelKey] = modelCost;
    totalCost += modelCost;
  }

  return {
    totalCost,
    byModel,
    warnings,
  };
}
