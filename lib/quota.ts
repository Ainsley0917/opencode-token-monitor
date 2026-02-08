import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export type QuotaSource = "antigravity" | "codex";
export type Severity = "info" | "warning" | "error";

export type QuotaStatus = {
  source: QuotaSource;
  scope: string;
  remainingFraction: number;
  resetsAt?: string;
  severity: Severity;
};

export function getSeverity(remainingFraction: number): Severity {
  if (remainingFraction >= 0.5) return "info";
  if (remainingFraction >= 0.2) return "warning";
  return "error";
}

export function loadAntigravityQuota(basePath?: string): QuotaStatus[] {
  const configPath =
    basePath ?? join(homedir(), ".config", "opencode", "antigravity-accounts.json");

  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);

    const byScope = new Map<string, QuotaStatus>();

    if (!config.accounts || !Array.isArray(config.accounts)) {
      return [];
    }

    for (const account of config.accounts) {
      if (account && typeof account === "object" && "enabled" in account && account.enabled === false) {
        continue;
      }
      const cachedQuota = account?.cachedQuota;
      if (!cachedQuota || typeof cachedQuota !== "object") {
        continue;
      }

      for (const [scope, quotaData] of Object.entries(cachedQuota)) {
        if (
          quotaData &&
          typeof quotaData === "object" &&
          "remainingFraction" in quotaData &&
          typeof quotaData.remainingFraction === "number"
        ) {
          const remainingFraction = quotaData.remainingFraction;
          const resetsAt =
            "resetTime" in quotaData && typeof quotaData.resetTime === "string"
              ? quotaData.resetTime
              : undefined;
          const next: QuotaStatus = {
            source: "antigravity",
            scope,
            remainingFraction,
            resetsAt,
            severity: getSeverity(remainingFraction),
          };

          const existing = byScope.get(scope);
          if (!existing) {
            byScope.set(scope, next);
            continue;
          }

          if (next.remainingFraction > existing.remainingFraction) {
            byScope.set(scope, next);
            continue;
          }

          if (
            next.remainingFraction === existing.remainingFraction &&
            !existing.resetsAt &&
            next.resetsAt
          ) {
            byScope.set(scope, next);
          }
        }
      }
    }

    return Array.from(byScope.values()).sort((a, b) => a.scope.localeCompare(b.scope));
  } catch (error) {
    console.warn(`Failed to load Antigravity quota from ${configPath}:`, error);
    return [];
  }
}

export function loadCodexQuota(basePath?: string): QuotaStatus[] {
  const sessionsPath = basePath
    ? join(basePath, "sessions")
    : join(homedir(), ".codex", "sessions");

  if (!existsSync(sessionsPath)) {
    return [];
  }

  try {
    let newestFile: string | null = null;
    let newestMtime = 0;

    const sessionDirs = readdirSync(sessionsPath);

    for (const sessionDir of sessionDirs) {
      const sessionPath = join(sessionsPath, sessionDir);
      
      try {
        const stat = statSync(sessionPath);
        if (!stat.isDirectory()) continue;

        const jsonlPath = join(sessionPath, "session.jsonl");
        if (!existsSync(jsonlPath)) continue;

        const fileStat = statSync(jsonlPath);
        if (fileStat.mtimeMs > newestMtime) {
          newestMtime = fileStat.mtimeMs;
          newestFile = jsonlPath;
        }
      } catch {
        continue;
      }
    }

    if (!newestFile) {
      return [];
    }

    const content = readFileSync(newestFile, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");

    let lastRateLimits: any = null;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.rate_limits) {
          lastRateLimits = parsed.rate_limits;
        } else if (parsed.payload?.rate_limits) {
          lastRateLimits = parsed.payload.rate_limits;
        }
      } catch {
        continue;
      }
    }

    if (!lastRateLimits) {
      return [];
    }

    const results: QuotaStatus[] = [];

    for (const [scope, data] of Object.entries(lastRateLimits)) {
      if (data && typeof data === "object" && "used_percent" in data) {
        const usedPercent = (data as any).used_percent;
        const remainingFraction = 1 - usedPercent / 100;
        const resetsAt = (data as any).resets_at;

        results.push({
          source: "codex",
          scope,
          remainingFraction,
          resetsAt,
          severity: getSeverity(remainingFraction),
        });
      }
    }

    return results;
  } catch (error) {
    console.warn(`Failed to load Codex quota from ${sessionsPath}:`, error);
    return [];
  }
}

export function loadAllQuota(): QuotaStatus[] {
  return [...loadAntigravityQuota(), ...loadCodexQuota()];
}
