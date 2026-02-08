import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SessionRecord } from "./types";
import type { Severity } from "./quota";

export type BudgetConfig = {
  daily?: number;
  weekly?: number;
  monthly?: number;
  thresholds?: {
    warning?: number;
    error?: number;
  };
};

export type BudgetStatus = {
  period: "daily" | "weekly" | "monthly";
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  severity: Severity;
};

export function loadBudgetConfig(basePath?: string): BudgetConfig {
  const searchPaths = basePath
    ? [basePath]
    : [
        join(process.cwd(), "token-monitor.json"),
        join(homedir(), ".opencode", "token-monitor.json"),
        join(homedir(), ".config", "opencode", "token-monitor.json"),
      ];

  for (const path of searchPaths) {
    if (!existsSync(path)) {
      continue;
    }

    try {
      const content = readFileSync(path, "utf-8");
      const config = JSON.parse(content);

      if (config.budget && typeof config.budget === "object") {
        const budget: BudgetConfig = {};
        if (typeof config.budget.daily === "number") {
          budget.daily = config.budget.daily;
        }
        if (typeof config.budget.weekly === "number") {
          budget.weekly = config.budget.weekly;
        }
        if (typeof config.budget.monthly === "number") {
          budget.monthly = config.budget.monthly;
        }
        if (
          config.budget.thresholds &&
          typeof config.budget.thresholds === "object"
        ) {
          budget.thresholds = {};

          if (typeof config.budget.thresholds.warning === "number") {
            budget.thresholds.warning = config.budget.thresholds.warning;
          }

          if (typeof config.budget.thresholds.error === "number") {
            budget.thresholds.error = config.budget.thresholds.error;
          }
        }
        return budget;
      }
    } catch (error) {
      console.warn(`Failed to load budget config from ${path}:`, error);
      continue;
    }
  }

  return {};
}

export function computeSpend(
  records: SessionRecord[],
  period: "daily" | "weekly" | "monthly"
): number {
  const now = Date.now();
  const windowMs: Record<"daily" | "weekly" | "monthly", number> = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  const cutoff = now - windowMs[period];

  return records
    .filter((record) => record.timestamp >= cutoff)
    .reduce((sum, record) => sum + record.cost, 0);
}

export function getBudgetStatus(
  records: SessionRecord[],
  config: BudgetConfig
): BudgetStatus[] {
  const statuses: BudgetStatus[] = [];

  let warningPct = config.thresholds?.warning ?? 50;
  let errorPct = config.thresholds?.error ?? 95;

  const invalidRange =
    warningPct < 0 || warningPct > 100 || errorPct < 0 || errorPct > 100;
  if (invalidRange || warningPct >= errorPct) {
    warningPct = 50;
    errorPct = 95;
  }

  const periods: Array<"daily" | "weekly" | "monthly"> = [
    "daily",
    "weekly",
    "monthly",
  ];

  for (const period of periods) {
    const limitValue = config[period];
    if (limitValue === undefined || limitValue === null) {
      continue;
    }
    const limit: number = limitValue;

    const spent = computeSpend(records, period);
    const remaining = limit - spent;
    const percentage = Math.round((spent / limit) * 100);

    let severity: Severity;
    if (percentage >= errorPct) {
      severity = "error";
    } else if (percentage >= warningPct) {
      severity = "warning";
    } else {
      severity = "info";
    }

    statuses.push({
      period,
      limit,
      spent,
      remaining,
      percentage,
      severity,
    });
  }

  return statuses;
}

export function formatBudgetSection(statuses: BudgetStatus[]): string {
  if (statuses.length === 0) {
    return "";
  }

  const lines: string[] = [];

  for (const status of statuses) {
    const icon =
      status.severity === "error"
        ? "🚨"
        : status.severity === "warning"
        ? "⚠️"
        : "ℹ️";

    const periodLabel =
      status.period.charAt(0).toUpperCase() + status.period.slice(1);

    lines.push(
      `- ${icon} ${periodLabel}: $${status.spent.toFixed(2)} / $${status.limit.toFixed(2)} (${status.percentage}%)`
    );
  }

  return lines.join("\n");
}
