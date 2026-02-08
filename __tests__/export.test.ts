import { describe, test, expect } from "bun:test";
import { exportToJSON, exportToCSV, exportToMarkdown, exportData } from "../lib/export";
import type { SessionRecord } from "../lib/types";

describe("Export Functions", () => {
  const mockRecords: SessionRecord[] = [
    {
      sessionID: "ses_abc123",
      timestamp: new Date("2026-02-07T10:00:00.000Z").getTime(),
      totals: {
        input: 1500,
        output: 800,
        total: 2300,
        reasoning: 0,
        cache: { read: 100, write: 50 },
      },
      byModel: {
        "anthropic/claude-sonnet-4": {
          input: 1500,
          output: 800,
          total: 2300,
          reasoning: 0,
          cache: { read: 100, write: 50 },
        },
      },
      cost: 0.0234,
    },
    {
      sessionID: "ses_def456",
      timestamp: new Date("2026-02-07T11:00:00.000Z").getTime(),
      totals: {
        input: 2000,
        output: 1200,
        total: 3200,
        reasoning: 500,
        cache: { read: 200, write: 100 },
      },
      byModel: {
        "openai/gpt-4o": {
          input: 2000,
          output: 1200,
          total: 3200,
          reasoning: 500,
          cache: { read: 200, write: 100 },
        },
      },
      cost: 0.0456,
    },
  ];

  const recordWithComma: SessionRecord = {
    sessionID: "ses_with,comma",
    timestamp: new Date("2026-02-07T12:00:00.000Z").getTime(),
    totals: {
      input: 1000,
      output: 500,
      total: 1500,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    byModel: {
      "provider/model": {
        input: 1000,
        output: 500,
        total: 1500,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
    cost: 0.0123,
  };

  describe("exportToJSON", () => {
    test("returns valid pretty-printed JSON", () => {
      const result = exportToJSON(mockRecords);
      
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      
      expect(result).toContain("\n");
      expect(result).toContain("  ");
      
      expect(parsed[0]).toHaveProperty("sessionID", "ses_abc123");
      expect(parsed[0]).toHaveProperty("timestamp");
      expect(parsed[0]).toHaveProperty("totals");
      expect(parsed[0]).toHaveProperty("byModel");
      expect(parsed[0]).toHaveProperty("cost", 0.0234);
    });

    test("handles empty array", () => {
      const result = exportToJSON([]);
      const parsed = JSON.parse(result);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });

    test("handles single record", () => {
      const result = exportToJSON([mockRecords[0]!]);
      const parsed = JSON.parse(result);
      
      expect(parsed).toHaveLength(1);
      expect(parsed[0].sessionID).toBe("ses_abc123");
    });
  });

  describe("exportToCSV", () => {
    test("includes header row", () => {
      const result = exportToCSV(mockRecords);
      const lines = result.split("\n");
      
      expect(lines[0]).toBe("sessionID,projectID,timestamp,input,output,total,reasoning,cache_read,cache_write,cost");
    });

    test("exports records correctly", () => {
      const result = exportToCSV(mockRecords);
      const lines = result.split("\n");
      
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe("ses_abc123,,2026-02-07T10:00:00.000Z,1500,800,2300,0,100,50,0.0234");
      expect(lines[2]).toBe("ses_def456,,2026-02-07T11:00:00.000Z,2000,1200,3200,500,200,100,0.0456");
    });

    test("escapes commas in sessionID", () => {
      const result = exportToCSV([recordWithComma]);
      const lines = result.split("\n");
      
      expect(lines[1]).toContain('"ses_with,comma"');
    });

    test("handles empty array", () => {
      const result = exportToCSV([]);
      const lines = result.split("\n");
      
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe("sessionID,projectID,timestamp,input,output,total,reasoning,cache_read,cache_write,cost");
    });

    test("escapes quotes in sessionID", () => {
      const recordWithQuote: SessionRecord = {
        sessionID: 'ses_with"quote',
        timestamp: new Date("2026-02-07T12:00:00.000Z").getTime(),
        totals: {
          input: 1000,
          output: 500,
          total: 1500,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 0.0123,
      };
      
      const result = exportToCSV([recordWithQuote]);
      const lines = result.split("\n");
      
      expect(lines[1]).toContain('"ses_with""quote"');
    });
  });

  describe("exportToMarkdown", () => {
    test("includes table header", () => {
      const result = exportToMarkdown(mockRecords);
      
      expect(result).toContain("| Session ID | Project ID | Date | Input | Output | Total | Reasoning | Cache R/W | Cost |");
      expect(result).toContain("|------------|------------|------|-------|--------|-------|-----------|-----------|------|");
    });

    test("formats records as table rows", () => {
      const result = exportToMarkdown(mockRecords);
      
      expect(result).toContain("| ses_abc123... | — | 2026-02-07");
      expect(result).toContain("| ses_def456... | — | 2026-02-07");
      expect(result).toContain("1,500");
      expect(result).toContain("2,000");
      expect(result).toContain("$0.0234");
      expect(result).toContain("$0.0456");
    });

    test("handles empty array", () => {
      const result = exportToMarkdown([]);
      
      expect(result).toContain("| Session ID |");
      expect(result).toContain("No records to display");
    });

    test("truncates long session IDs", () => {
      const result = exportToMarkdown(mockRecords);
      
      expect(result).toContain("ses_abc123...");
      expect(result).not.toContain("ses_abc123 |");
    });
  });

  describe("exportData", () => {
    test("dispatches to JSON export", () => {
      const result = exportData(mockRecords, "json");
      const parsed = JSON.parse(result);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });

    test("dispatches to CSV export", () => {
      const result = exportData(mockRecords, "csv");
      
      expect(result).toContain("sessionID,projectID,timestamp");
    });

    test("dispatches to Markdown export", () => {
      const result = exportData(mockRecords, "markdown");
      
      expect(result).toContain("| Session ID |");
    });
  });
});
