import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getSeverity,
  loadAntigravityQuota,
  loadCodexQuota,
  loadAllQuota,
  type QuotaStatus,
  type QuotaSource,
  type Severity,
} from "../lib/quota";

describe("Quota Ingestion", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "quota-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getSeverity", () => {
    test("returns info for >= 0.5", () => {
      expect(getSeverity(0.5)).toBe("info");
      expect(getSeverity(0.75)).toBe("info");
      expect(getSeverity(1.0)).toBe("info");
    });

    test("returns warning for >= 0.2 and < 0.5", () => {
      expect(getSeverity(0.2)).toBe("warning");
      expect(getSeverity(0.3)).toBe("warning");
      expect(getSeverity(0.49)).toBe("warning");
    });

    test("returns error for < 0.2", () => {
      expect(getSeverity(0.0)).toBe("error");
      expect(getSeverity(0.1)).toBe("error");
      expect(getSeverity(0.19)).toBe("error");
    });
  });

  describe("loadAntigravityQuota", () => {
    test("parses valid quota file with multiple accounts", () => {
      const configPath = join(tempDir, "antigravity-accounts.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          accounts: [
            {
              email: "user@example.com",
              refreshToken: "secret_token_12345",
              cachedQuota: {
                claude: { remainingFraction: 0.75 },
                "gemini-pro": { remainingFraction: 0.5 },
                "gemini-flash": { remainingFraction: 0.9 },
              },
            },
          ],
        })
      );

      const result = loadAntigravityQuota(configPath);

      expect(result).toHaveLength(3);
      expect(result.find((q) => q.scope === "claude")).toEqual({
        source: "antigravity",
        scope: "claude",
        remainingFraction: 0.75,
        severity: "info",
        resetsAt: undefined,
      });
      expect(result.find((q) => q.scope === "gemini-pro")).toEqual({
        source: "antigravity",
        scope: "gemini-pro",
        remainingFraction: 0.5,
        severity: "info",
        resetsAt: undefined,
      });
      expect(result.find((q) => q.scope === "gemini-flash")).toEqual({
        source: "antigravity",
        scope: "gemini-flash",
        remainingFraction: 0.9,
        severity: "info",
        resetsAt: undefined,
      });
    });

    test("deduplicates scopes across accounts (keeps max remainingFraction)", () => {
      const configPath = join(tempDir, "antigravity-accounts.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          accounts: [
            {
              cachedQuota: {
                claude: { remainingFraction: 0, resetTime: "2026-02-07T10:00:00Z" },
              },
            },
            {
              cachedQuota: {
                claude: { remainingFraction: 1, resetTime: "2026-02-08T10:00:00Z" },
              },
            },
          ],
        })
      );

      const result = loadAntigravityQuota(configPath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "antigravity",
        scope: "claude",
        remainingFraction: 1,
        severity: "info",
        resetsAt: "2026-02-08T10:00:00Z",
      });
    });

    test("skips accounts with enabled=false", () => {
      const configPath = join(tempDir, "antigravity-accounts.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          accounts: [
            {
              enabled: false,
              cachedQuota: {
                claude: { remainingFraction: 0 },
              },
            },
            {
              enabled: true,
              cachedQuota: {
                claude: { remainingFraction: 0.8, resetTime: "2026-02-08T10:00:00Z" },
              },
            },
          ],
        })
      );

      const result = loadAntigravityQuota(configPath);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        source: "antigravity",
        scope: "claude",
        remainingFraction: 0.8,
        severity: "info",
        resetsAt: "2026-02-08T10:00:00Z",
      });
    });

    test("returns empty array when file doesn't exist", () => {
      const configPath = join(tempDir, "nonexistent.json");
      const result = loadAntigravityQuota(configPath);
      
      expect(result).toEqual([]);
    });

    test("handles malformed JSON gracefully", () => {
      const configPath = join(tempDir, "bad.json");
      writeFileSync(configPath, "{ invalid json }");

      const result = loadAntigravityQuota(configPath);
      
      expect(result).toEqual([]);
    });

    test("handles missing cachedQuota field", () => {
      const configPath = join(tempDir, "no-quota.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          accounts: [
            {
              email: "user@example.com",
            },
          ],
        })
      );

      const result = loadAntigravityQuota(configPath);
      
      expect(result).toEqual([]);
    });

    test("handles empty accounts array", () => {
      const configPath = join(tempDir, "empty.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          accounts: [],
        })
      );

      const result = loadAntigravityQuota(configPath);
      
      expect(result).toEqual([]);
    });

    test("applies correct severity levels", () => {
      const configPath = join(tempDir, "severity.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          accounts: [
            {
              cachedQuota: {
                high: { remainingFraction: 0.8 },
                medium: { remainingFraction: 0.3 },
                low: { remainingFraction: 0.1 },
              },
            },
          ],
        })
      );

      const result = loadAntigravityQuota(configPath);

      expect(result).toHaveLength(3);
      expect(result.find((q: QuotaStatus) => q.scope === "high")?.severity).toBe("info");
      expect(result.find((q: QuotaStatus) => q.scope === "medium")?.severity).toBe("warning");
      expect(result.find((q: QuotaStatus) => q.scope === "low")?.severity).toBe("error");
    });

    test("never includes sensitive data in output", () => {
      const configPath = join(tempDir, "sensitive.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          accounts: [
            {
              email: "secret@example.com",
              refreshToken: "super_secret_token",
              access_token: "access_123",
              cachedQuota: {
                claude: { remainingFraction: 0.75 },
              },
            },
          ],
        })
      );

      const result = loadAntigravityQuota(configPath);

      const jsonOutput = JSON.stringify(result);
      expect(jsonOutput).not.toContain("secret@example.com");
      expect(jsonOutput).not.toContain("super_secret_token");
      expect(jsonOutput).not.toContain("access_123");
      expect(jsonOutput).not.toContain("email");
      expect(jsonOutput).not.toContain("refreshToken");
      expect(jsonOutput).not.toContain("access_token");
    });
  });

  describe("loadCodexQuota", () => {
    test("extracts rate_limits from newest JSONL file", () => {
      const sessionsDir = join(tempDir, "sessions", "ses_123");
      mkdirSync(sessionsDir, { recursive: true });

      const jsonlPath = join(sessionsDir, "session.jsonl");
      const lines = [
        JSON.stringify({ type: "init", timestamp: "2026-02-07T10:00:00Z" }),
        JSON.stringify({
          type: "response",
          rate_limits: {
            primary: {
              used_percent: 25,
              window_minutes: 300,
              resets_at: "2026-02-07T15:00:00Z",
            },
            secondary: {
              used_percent: 10,
              window_minutes: 10080,
              resets_at: "2026-02-14T10:00:00Z",
            },
          },
        }),
        JSON.stringify({ type: "end", timestamp: "2026-02-07T10:30:00Z" }),
      ];
      writeFileSync(jsonlPath, lines.join("\n"));

      const result = loadCodexQuota(tempDir);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: "codex",
        scope: "primary",
        remainingFraction: 0.75, // 1 - 0.25
        resetsAt: "2026-02-07T15:00:00Z",
        severity: "info",
      });
      expect(result[1]).toEqual({
        source: "codex",
        scope: "secondary",
        remainingFraction: 0.9, // 1 - 0.10
        resetsAt: "2026-02-14T10:00:00Z",
        severity: "info",
      });
    });

    test("returns empty array when sessions dir doesn't exist", () => {
      const result = loadCodexQuota(join(tempDir, "nonexistent"));
      
      expect(result).toEqual([]);
    });

    test("handles malformed JSONL gracefully", () => {
      const sessionsDir = join(tempDir, "sessions", "ses_bad");
      mkdirSync(sessionsDir, { recursive: true });

      const jsonlPath = join(sessionsDir, "session.jsonl");
      writeFileSync(jsonlPath, "{ invalid json }\n{ also bad }");

      const result = loadCodexQuota(tempDir);
      
      expect(result).toEqual([]);
    });

    test("uses newest session file when multiple exist", async () => {
      const oldDir = join(tempDir, "sessions", "ses_old");
      const newDir = join(tempDir, "sessions", "ses_new");
      mkdirSync(oldDir, { recursive: true });
      mkdirSync(newDir, { recursive: true });

      const oldPath = join(oldDir, "session.jsonl");
      writeFileSync(
        oldPath,
        JSON.stringify({
          type: "response",
          rate_limits: {
            primary: { used_percent: 50, window_minutes: 300 },
          },
        })
      );

      const wait = new Promise((resolve) => setTimeout(resolve, 10));
      await wait;

      const newPath = join(newDir, "session.jsonl");
      writeFileSync(
        newPath,
        JSON.stringify({
          type: "response",
          rate_limits: {
            primary: { used_percent: 20, window_minutes: 300 },
          },
        })
      );

      const result = loadCodexQuota(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.remainingFraction).toBe(0.8);
    });

    test("extracts last rate_limits entry from multi-line JSONL", () => {
      const sessionsDir = join(tempDir, "sessions", "ses_multi");
      mkdirSync(sessionsDir, { recursive: true });

      const jsonlPath = join(sessionsDir, "session.jsonl");
      const lines = [
        JSON.stringify({
          type: "response",
          rate_limits: {
            primary: { used_percent: 10, window_minutes: 300 },
          },
        }),
        JSON.stringify({ type: "other", data: "something" }),
        JSON.stringify({
          type: "response",
          rate_limits: {
            primary: { used_percent: 30, window_minutes: 300 },
          },
        }),
      ];
      writeFileSync(jsonlPath, lines.join("\n"));

      const result = loadCodexQuota(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.remainingFraction).toBe(0.7);
    });

    test("applies correct severity based on usage", () => {
      const sessionsDir = join(tempDir, "sessions", "ses_severity");
      mkdirSync(sessionsDir, { recursive: true });

      const jsonlPath = join(sessionsDir, "session.jsonl");
      writeFileSync(
        jsonlPath,
        JSON.stringify({
          type: "response",
          rate_limits: {
            primary: { used_percent: 40, window_minutes: 300 },
            secondary: { used_percent: 70, window_minutes: 300 },
          },
        })
      );

      const result = loadCodexQuota(tempDir);

      expect(result).toHaveLength(2);
      expect(result.find((q: QuotaStatus) => q.scope === "primary")?.severity).toBe("info");
      expect(result.find((q: QuotaStatus) => q.scope === "secondary")?.severity).toBe("warning");
    });

    test("never includes sensitive data in output", () => {
      const sessionsDir = join(tempDir, "sessions", "ses_sensitive");
      mkdirSync(sessionsDir, { recursive: true });

      const jsonlPath = join(sessionsDir, "session.jsonl");
      writeFileSync(
        jsonlPath,
        JSON.stringify({
          type: "response",
          access_token: "secret_token_xyz",
          auth: { apiKey: "super_secret" },
          rate_limits: {
            primary: { used_percent: 25, window_minutes: 300 },
          },
        })
      );

      const result = loadCodexQuota(tempDir);

      const jsonOutput = JSON.stringify(result);
      expect(jsonOutput).not.toContain("secret_token_xyz");
      expect(jsonOutput).not.toContain("super_secret");
      expect(jsonOutput).not.toContain("access_token");
      expect(jsonOutput).not.toContain("apiKey");
    });

    test("extracts rate_limits from nested payload structure", () => {
      const sessionsDir = join(tempDir, "sessions", "ses_nested");
      mkdirSync(sessionsDir, { recursive: true });

      const jsonlPath = join(sessionsDir, "session.jsonl");
      const lines = [
        JSON.stringify({
          timestamp: "2026-02-04T07:12:41.687Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {},
            rate_limits: {
              primary: {
                used_percent: 14.0,
                window_minutes: 300,
                resets_at: "2026-02-04T12:00:00Z",
              },
              secondary: {
                used_percent: 7.0,
                window_minutes: 10080,
                resets_at: "2026-02-11T07:00:00Z",
              },
              credits: {
                has_credits: false,
                unlimited: false,
                balance: null,
              },
              plan_type: null,
            },
          },
        }),
      ];
      writeFileSync(jsonlPath, lines.join("\n"));

      const result = loadCodexQuota(tempDir);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        source: "codex",
        scope: "primary",
        remainingFraction: 0.86, // 1 - 0.14
        resetsAt: "2026-02-04T12:00:00Z",
        severity: "info",
      });
      expect(result[1]?.source).toBe("codex");
      expect(result[1]?.scope).toBe("secondary");
      expect(result[1]?.remainingFraction).toBeCloseTo(0.93, 2); // 1 - 0.07
      expect(result[1]?.resetsAt).toBe("2026-02-11T07:00:00Z");
      expect(result[1]?.severity).toBe("info");
    });

    test("safely skips non-quota entries (credits, plan_type)", () => {
      const sessionsDir = join(tempDir, "sessions", "ses_mixed");
      mkdirSync(sessionsDir, { recursive: true });

      const jsonlPath = join(sessionsDir, "session.jsonl");
      writeFileSync(
        jsonlPath,
        JSON.stringify({
          type: "response",
          payload: {
            rate_limits: {
              primary: { used_percent: 20, window_minutes: 300 },
              credits: { has_credits: false, balance: null },
              plan_type: null,
            },
          },
        })
      );

      const result = loadCodexQuota(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.scope).toBe("primary");
    });
  });

  describe("loadAllQuota", () => {
    test("combines Antigravity and Codex sources", () => {
      const agPath = join(tempDir, "antigravity-accounts.json");
      writeFileSync(
        agPath,
        JSON.stringify({
          accounts: [
            {
              cachedQuota: {
                claude: { remainingFraction: 0.8 },
              },
            },
          ],
        })
      );

      const sessionsDir = join(tempDir, "sessions", "ses_test");
      mkdirSync(sessionsDir, { recursive: true });
      const jsonlPath = join(sessionsDir, "session.jsonl");
      writeFileSync(
        jsonlPath,
        JSON.stringify({
          type: "response",
          rate_limits: {
            primary: { used_percent: 15, window_minutes: 300 },
          },
        })
      );

      const result = loadAllQuota();

      const sources = result.map((q: QuotaStatus) => q.source);
      expect(sources.length).toBeGreaterThan(0);
    });
  });
});
