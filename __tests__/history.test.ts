import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getShardPath, saveSessionRecord, loadHistoryForRange } from "../lib/history";
import type { SessionRecord } from "../lib/types";

describe("History Persistence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "token-history-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getShardPath", () => {
    test("formats path with YYYY-MM format", () => {
      const date = new Date("2026-02-15T10:30:00Z");
      const path = getShardPath(date, tempDir);
      
      expect(path).toContain("2026-02.json");
      expect(path).toContain(tempDir);
    });

    test("handles single-digit months with leading zero", () => {
      const date = new Date("2026-03-15T10:30:00Z");
      const path = getShardPath(date, tempDir);
      
      expect(path).toContain("2026-03.json");
    });

    test("handles year boundaries", () => {
      const date = new Date("2025-12-31T23:59:59Z");
      const path = getShardPath(date, tempDir);
      
      expect(path).toContain("2025-12.json");
    });

    test("uses default base dir when not provided", () => {
      const date = new Date("2026-02-15T10:30:00Z");
      const path = getShardPath(date);
      
      expect(path).toContain("2026-02.json");
      expect(path).toContain("token-history");
    });

    test("throws for invalid date", () => {
      expect(() => getShardPath(new Date(NaN), tempDir)).toThrow("Invalid date passed to getShardPath");
    });
  });

  describe("saveSessionRecord", () => {
    test("creates new shard file if it doesn't exist", async () => {
      const record: SessionRecord = {
        sessionID: "ses_test123",
        timestamp: new Date("2026-02-15T10:30:00Z").getTime(),
        totals: {
          input: 1000,
          output: 500,
          total: 1500,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {
          "anthropic/claude-sonnet-4": {
            input: 1000,
            output: 500,
            total: 1500,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        cost: 0.0123,
      };

      await saveSessionRecord(record, tempDir);

      const shardPath = getShardPath(new Date(record.timestamp), tempDir);
      const content = readFileSync(shardPath, "utf-8");
      const data = JSON.parse(content);

      expect(data).toHaveLength(1);
      expect(data[0].sessionID).toBe("ses_test123");
    });

    test("saves and loads projectID roundtrip", async () => {
      const record: SessionRecord = {
        sessionID: "ses_project_test",
        projectID: "prj_abc123",
        timestamp: new Date("2026-02-15T10:30:00Z").getTime(),
        totals: { input: 100, output: 50, total: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0.001,
      };

      await saveSessionRecord(record, tempDir);

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir
      );

      expect(result).toHaveLength(1);
      expect(result[0].sessionID).toBe("ses_project_test");
      expect(result[0].projectID).toBe("prj_abc123");
    });

    test("appends to existing shard file", async () => {
      const record1: SessionRecord = {
        sessionID: "ses_001",
        timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
        totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0.01,
      };

      const record2: SessionRecord = {
        sessionID: "ses_002",
        timestamp: new Date("2026-02-15T11:00:00Z").getTime(),
        totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0.02,
      };

      await saveSessionRecord(record1, tempDir);
      await saveSessionRecord(record2, tempDir);

      const shardPath = getShardPath(new Date(record1.timestamp), tempDir);
      const content = readFileSync(shardPath, "utf-8");
      const data = JSON.parse(content);

      expect(data).toHaveLength(2);
      expect(data[0].sessionID).toBe("ses_001");
      expect(data[1].sessionID).toBe("ses_002");
    });

    test("updates existing session record (dedup)", async () => {
      const record1: SessionRecord = {
        sessionID: "ses_same",
        timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
        totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0.01,
      };

      const record2: SessionRecord = {
        sessionID: "ses_same",
        timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
        totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0.02,
      };

      await saveSessionRecord(record1, tempDir);
      await saveSessionRecord(record2, tempDir);

      const shardPath = getShardPath(new Date(record1.timestamp), tempDir);
      const content = readFileSync(shardPath, "utf-8");
      const data = JSON.parse(content);

      expect(data).toHaveLength(1);
      expect(data[0].sessionID).toBe("ses_same");
      expect(data[0].cost).toBe(0.02); // Updated
    });

    test("handles corrupted JSON gracefully during save", async () => {
      const shardPath = getShardPath(new Date("2026-02-15T10:00:00Z"), tempDir);
      
      // Write invalid JSON to shard
      writeFileSync(shardPath, "{ invalid json }", "utf-8");

      const record: SessionRecord = {
        sessionID: "ses_recover",
        timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
        totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0.01,
      };

      // Should not throw, should replace with new array
      await saveSessionRecord(record, tempDir);

      const content = readFileSync(shardPath, "utf-8");
      const data = JSON.parse(content);

      expect(data).toHaveLength(1);
      expect(data[0].sessionID).toBe("ses_recover");
    });

    test("throws for NaN timestamp", async () => {
      const record = {
        sessionID: "ses_nan",
        timestamp: NaN,
        totals: { input: 0, output: 0, total: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0,
      } as SessionRecord;

      await expect(saveSessionRecord(record, tempDir)).rejects.toThrow(/Invalid timestamp/);
    });

    test("throws for Infinity timestamp", async () => {
      const record = {
        sessionID: "ses_inf",
        timestamp: Infinity,
        totals: { input: 0, output: 0, total: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0,
      } as SessionRecord;

      await expect(saveSessionRecord(record, tempDir)).rejects.toThrow(/Invalid timestamp/);
    });

    test("throws for undefined timestamp", async () => {
      const record = {
        sessionID: "ses_undef",
        timestamp: undefined as any,
        totals: { input: 0, output: 0, total: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0,
      } as SessionRecord;

      await expect(saveSessionRecord(record, tempDir)).rejects.toThrow(/Invalid timestamp/);
    });

    test("handles epoch 0 timestamp", async () => {
      const record: SessionRecord = {
        sessionID: "ses_epoch0",
        timestamp: 0,
        totals: { input: 0, output: 0, total: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        byModel: {},
        cost: 0,
      };

      await saveSessionRecord(record, tempDir);
      const shardPath = getShardPath(new Date(0), tempDir);
      expect(readFileSync(shardPath, "utf-8")).toContain("ses_epoch0");
    });
  });

  describe("loadHistoryForRange", () => {
    test("loads records from single month", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_001",
          timestamp: new Date("2026-02-05T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_002",
          timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.sessionID).toBe("ses_001");
      expect(result[1]?.sessionID).toBe("ses_002");
    });

    test("loads records across multiple months", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_jan",
          timestamp: new Date("2026-01-15T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_feb",
          timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
        {
          sessionID: "ses_mar",
          timestamp: new Date("2026-03-15T10:00:00Z").getTime(),
          totals: { input: 3000, output: 1500, total: 4500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.03,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-03-31T23:59:59Z"),
        tempDir
      );

      expect(result).toHaveLength(3);
      expect(result.map((r: SessionRecord) => r.sessionID)).toEqual(["ses_jan", "ses_feb", "ses_mar"]);
    });

    test("filters by date range", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_early",
          timestamp: new Date("2026-02-05T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_mid",
          timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
        {
          sessionID: "ses_late",
          timestamp: new Date("2026-02-25T10:00:00Z").getTime(),
          totals: { input: 3000, output: 1500, total: 4500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.03,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-02-10T00:00:00Z"),
        new Date("2026-02-20T23:59:59Z"),
        tempDir
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.sessionID).toBe("ses_mid");
    });

    test("returns empty array if shard doesn't exist", async () => {
      const result = await loadHistoryForRange(
        new Date("2026-12-01T00:00:00Z"),
        new Date("2026-12-31T23:59:59Z"),
        tempDir
      );

      expect(result).toEqual([]);
    });

    test("handles corrupted JSON gracefully during load", async () => {
      const shardPath = getShardPath(new Date("2026-02-15T10:00:00Z"), tempDir);
      
      // Write invalid JSON
      writeFileSync(shardPath, "{ broken json }", "utf-8");

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir
      );

      // Should return empty array, not crash
      expect(result).toEqual([]);
    });

    test("sorts results by timestamp ascending", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_003",
          timestamp: new Date("2026-02-25T10:00:00Z").getTime(),
          totals: { input: 3000, output: 1500, total: 4500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.03,
        },
        {
          sessionID: "ses_001",
          timestamp: new Date("2026-02-05T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_002",
          timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir
      );

      expect(result.map((r: SessionRecord) => r.sessionID)).toEqual(["ses_001", "ses_002", "ses_003"]);
    });

    test("filters by projectID when provided", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_proj_a",
          projectID: "prj_abc",
          timestamp: new Date("2026-02-05T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_proj_b",
          projectID: "prj_xyz",
          timestamp: new Date("2026-02-10T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
        {
          sessionID: "ses_proj_a2",
          projectID: "prj_abc",
          timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
          totals: { input: 1500, output: 750, total: 2250, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.015,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir,
        "prj_abc"
      );

      expect(result).toHaveLength(2);
      expect(result.map((r: SessionRecord) => r.sessionID)).toEqual(["ses_proj_a", "ses_proj_a2"]);
      expect(result.every((r: SessionRecord) => r.projectID === "prj_abc")).toBe(true);
    });

    test("excludes records with different projectID", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_proj_a",
          projectID: "prj_abc",
          timestamp: new Date("2026-02-05T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_proj_b",
          projectID: "prj_xyz",
          timestamp: new Date("2026-02-10T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir,
        "prj_xyz"
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.sessionID).toBe("ses_proj_b");
    });

    test("excludes legacy records (no projectID) when projectID filter provided", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_legacy",
          timestamp: new Date("2026-02-05T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_proj_a",
          projectID: "prj_abc",
          timestamp: new Date("2026-02-10T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir,
        "prj_abc"
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.sessionID).toBe("ses_proj_a");
      expect(result.find((r: SessionRecord) => r.sessionID === "ses_legacy")).toBeUndefined();
    });

    test("includes all records (legacy + project) when no projectID filter provided", async () => {
      const records: SessionRecord[] = [
        {
          sessionID: "ses_legacy",
          timestamp: new Date("2026-02-05T10:00:00Z").getTime(),
          totals: { input: 1000, output: 500, total: 1500, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.01,
        },
        {
          sessionID: "ses_proj_a",
          projectID: "prj_abc",
          timestamp: new Date("2026-02-10T10:00:00Z").getTime(),
          totals: { input: 2000, output: 1000, total: 3000, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.02,
        },
        {
          sessionID: "ses_proj_b",
          projectID: "prj_xyz",
          timestamp: new Date("2026-02-15T10:00:00Z").getTime(),
          totals: { input: 1500, output: 750, total: 2250, reasoning: 0, cache: { read: 0, write: 0 } },
          byModel: {},
          cost: 0.015,
        },
      ];

      for (const record of records) {
        await saveSessionRecord(record, tempDir);
      }

      const result = await loadHistoryForRange(
        new Date("2026-02-01T00:00:00Z"),
        new Date("2026-02-28T23:59:59Z"),
        tempDir
      );

      expect(result).toHaveLength(3);
      expect(result.map((r: SessionRecord) => r.sessionID)).toEqual(["ses_legacy", "ses_proj_a", "ses_proj_b"]);
    });
  });
});
