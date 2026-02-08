import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadBudgetConfig,
  computeSpend,
  getBudgetStatus,
  formatBudgetSection,
  type BudgetConfig,
  type BudgetStatus,
} from "../lib/budget";
import type { SessionRecord } from "../lib/types";

describe("loadBudgetConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `budget-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("loads valid config from file", () => {
    const configPath = join(tempDir, "token-monitor.json");
    const config = {
      budget: {
        daily: 10.0,
        weekly: 50.0,
        monthly: 200.0,
      },
    };
    writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const result = loadBudgetConfig(configPath);

    expect(result).toEqual({
      daily: 10.0,
      weekly: 50.0,
      monthly: 200.0,
    });
  });

  test("returns empty config if file does not exist", () => {
    const configPath = join(tempDir, "nonexistent.json");

    const result = loadBudgetConfig(configPath);

    expect(result).toEqual({});
  });

  test("returns empty config for malformed JSON", () => {
    const configPath = join(tempDir, "token-monitor.json");
    writeFileSync(configPath, "{ invalid json", "utf-8");

    const result = loadBudgetConfig(configPath);

    expect(result).toEqual({});
  });

  test("returns empty config if budget field is missing", () => {
    const configPath = join(tempDir, "token-monitor.json");
    const config = { pricing: {} };
    writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const result = loadBudgetConfig(configPath);

    expect(result).toEqual({});
  });

  test("handles partial budget config (only daily)", () => {
    const configPath = join(tempDir, "token-monitor.json");
    const config = {
      budget: {
        daily: 5.0,
      },
    };
    writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const result = loadBudgetConfig(configPath);

    expect(result).toEqual({
      daily: 5.0,
    });
  });

  test("parses threshold config when provided", () => {
    const configPath = join(tempDir, "token-monitor.json");
    const config = {
      budget: {
        daily: 5.0,
        thresholds: {
          warning: 70,
          error: 90,
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const result = loadBudgetConfig(configPath);

    expect(result).toEqual({
      daily: 5.0,
      thresholds: {
        warning: 70,
        error: 90,
      },
    });
  });

  test("maintains backward compatibility without thresholds", () => {
    const configPath = join(tempDir, "token-monitor.json");
    const config = {
      budget: {
        daily: 5.0,
        weekly: 25.0,
      },
    };
    writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const result = loadBudgetConfig(configPath);

    expect(result).toEqual({
      daily: 5.0,
      weekly: 25.0,
    });
  });
});

describe("computeSpend", () => {
  test("calculates daily spend (last 24 hours)", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now - 12 * 60 * 60 * 1000, // 12 hours ago
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 5.0,
      },
      {
        sessionID: "2",
        timestamp: now - 36 * 60 * 60 * 1000, // 36 hours ago (outside window)
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 10.0,
      },
      {
        sessionID: "3",
        timestamp: now - 1 * 60 * 60 * 1000, // 1 hour ago
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 3.0,
      },
    ];

    const result = computeSpend(records, "daily");

    expect(result).toBe(8.0); // 5.0 + 3.0 (excluding 36h ago)
  });

  test("calculates weekly spend (last 7 days)", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now - 3 * 24 * 60 * 60 * 1000, // 3 days ago
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 15.0,
      },
      {
        sessionID: "2",
        timestamp: now - 10 * 24 * 60 * 60 * 1000, // 10 days ago (outside window)
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 20.0,
      },
      {
        sessionID: "3",
        timestamp: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 5.0,
      },
    ];

    const result = computeSpend(records, "weekly");

    expect(result).toBe(20.0); // 15.0 + 5.0 (excluding 10 days ago)
  });

  test("calculates monthly spend (last 30 days)", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now - 15 * 24 * 60 * 60 * 1000, // 15 days ago
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 50.0,
      },
      {
        sessionID: "2",
        timestamp: now - 35 * 24 * 60 * 60 * 1000, // 35 days ago (outside window)
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 100.0,
      },
      {
        sessionID: "3",
        timestamp: now - 5 * 24 * 60 * 60 * 1000, // 5 days ago
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 25.0,
      },
    ];

    const result = computeSpend(records, "monthly");

    expect(result).toBe(75.0); // 50.0 + 25.0 (excluding 35 days ago)
  });

  test("handles empty records", () => {
    const result = computeSpend([], "daily");
    expect(result).toBe(0);
  });
});

describe("getBudgetStatus", () => {
  test("returns status for all configured periods", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now - 12 * 60 * 60 * 1000, // 12 hours ago
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 5.0,
      },
    ];

    const config: BudgetConfig = {
      daily: 10.0,
      weekly: 50.0,
    };

    const result = getBudgetStatus(records, config);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      period: "daily",
      limit: 10.0,
      spent: 5.0,
      remaining: 5.0,
      percentage: 50,
      severity: "warning",
    });
    expect(result[1]).toEqual({
      period: "weekly",
      limit: 50.0,
      spent: 5.0,
      remaining: 45.0,
      percentage: 10,
      severity: "info",
    });
  });

  test("assigns severity based on percentage thresholds", () => {
    const now = Date.now();

    // Test info severity (< 50%)
    const lowRecords: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 4.0,
      },
    ];
    const lowResult = getBudgetStatus(lowRecords, { daily: 10.0 });
    expect(lowResult[0]!.severity).toBe("info");
    expect(lowResult[0]!.percentage).toBe(40);

    // Test warning severity (50% <= x < 80%)
    const medRecords: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 6.0,
      },
    ];
    const medResult = getBudgetStatus(medRecords, { daily: 10.0 });
    expect(medResult[0]!.severity).toBe("warning");
    expect(medResult[0]!.percentage).toBe(60);

    // Test warning severity at 80%
    const highRecords: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 8.0,
      },
    ];
    const highResult = getBudgetStatus(highRecords, { daily: 10.0 });
    expect(highResult[0]!.severity).toBe("warning");
    expect(highResult[0]!.percentage).toBe(80);

    // Test error severity (>= 95%)
    const criticalRecords: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 9.5,
      },
    ];
    const criticalResult = getBudgetStatus(criticalRecords, { daily: 10.0 });
    expect(criticalResult[0]!.severity).toBe("error");
    expect(criticalResult[0]!.percentage).toBe(95);
  });

  test("handles budget overrun (> 100%)", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 15.0,
      },
    ];

    const result = getBudgetStatus(records, { daily: 10.0 });

    expect(result[0]).toEqual({
      period: "daily",
      limit: 10.0,
      spent: 15.0,
      remaining: -5.0,
      percentage: 150,
      severity: "error",
    });
  });

  test("uses default thresholds (50/95) when not configured", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 60.0,
      },
    ];

    const result = getBudgetStatus(records, { daily: 100.0 });

    expect(result[0]!.percentage).toBe(60);
    expect(result[0]!.severity).toBe("warning");
  });

  test("applies custom warning threshold", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 60.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
      thresholds: { warning: 70 },
    });

    expect(result[0]!.percentage).toBe(60);
    expect(result[0]!.severity).toBe("info");
  });

  test("applies custom error threshold", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 80.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
      thresholds: { error: 80 },
    });

    expect(result[0]!.percentage).toBe(80);
    expect(result[0]!.severity).toBe("error");
  });

  test("applies both custom thresholds together", () => {
    const now = Date.now();
    const warningRecords: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 65.0,
      },
    ];
    const errorRecords: SessionRecord[] = [
      {
        sessionID: "2",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 85.0,
      },
    ];

    const warningResult = getBudgetStatus(warningRecords, {
      daily: 100.0,
      thresholds: { warning: 60, error: 80 },
    });
    const errorResult = getBudgetStatus(errorRecords, {
      daily: 100.0,
      thresholds: { warning: 60, error: 80 },
    });

    expect(warningResult[0]!.severity).toBe("warning");
    expect(errorResult[0]!.severity).toBe("error");
  });

  test("falls back to defaults for out-of-range thresholds", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 60.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
      thresholds: { warning: -1, error: 120 },
    });

    expect(result[0]!.severity).toBe("warning");
  });

  test("falls back to defaults when warning threshold is greater than or equal to error", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 90.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
      thresholds: { warning: 90, error: 90 },
    });

    expect(result[0]!.severity).toBe("warning");
  });

  test("uses default error threshold when only warning is configured", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 96.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
      thresholds: { warning: 70 },
    });

    expect(result[0]!.severity).toBe("error");
  });

  test("uses default warning threshold when only error is configured", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 60.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
      thresholds: { error: 80 },
    });

    expect(result[0]!.severity).toBe("warning");
  });

  test("uses defaults when thresholds object is empty", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 60.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
      thresholds: {},
    });

    expect(result[0]!.severity).toBe("warning");
  });

  test("preserves behavior for configs without thresholds", () => {
    const now = Date.now();
    const records: SessionRecord[] = [
      {
        sessionID: "1",
        timestamp: now,
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 96.0,
      },
    ];

    const result = getBudgetStatus(records, {
      daily: 100.0,
    });

    expect(result[0]!.severity).toBe("error");
  });

  test("returns empty array for empty config", () => {
    const records: SessionRecord[] = [];
    const result = getBudgetStatus(records, {});

    expect(result).toEqual([]);
  });
});

describe("formatBudgetSection", () => {
  test("formats budget statuses as markdown bullet list", () => {
    const statuses: BudgetStatus[] = [
      {
        period: "daily",
        limit: 10.0,
        spent: 5.0,
        remaining: 5.0,
        percentage: 50,
        severity: "info",
      },
      {
        period: "weekly",
        limit: 50.0,
        spent: 40.0,
        remaining: 10.0,
        percentage: 80,
        severity: "warning",
      },
    ];

    const result = formatBudgetSection(statuses);

    expect(result).toContain("Daily: $5.00 / $10.00 (50%)");
    expect(result).toContain("Weekly: $40.00 / $50.00 (80%)");
    expect(result).toContain("⚠️");
  });

  test("shows error indicator for critical status", () => {
    const statuses: BudgetStatus[] = [
      {
        period: "daily",
        limit: 10.0,
        spent: 9.8,
        remaining: 0.2,
        percentage: 98,
        severity: "error",
      },
    ];

    const result = formatBudgetSection(statuses);

    expect(result).toContain("🚨");
    expect(result).toContain("Daily: $9.80 / $10.00 (98%)");
  });

  test("handles budget overrun", () => {
    const statuses: BudgetStatus[] = [
      {
        period: "monthly",
        limit: 100.0,
        spent: 120.0,
        remaining: -20.0,
        percentage: 120,
        severity: "error",
      },
    ];

    const result = formatBudgetSection(statuses);

    expect(result).toContain("Monthly: $120.00 / $100.00 (120%)");
    expect(result).toContain("🚨");
  });

  test("returns empty string for empty input", () => {
    const result = formatBudgetSection([]);
    expect(result).toBe("");
  });
});
