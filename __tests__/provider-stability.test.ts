import { test, expect, describe } from "bun:test";
import {
  truncateOutput,
  limitTableRows,
  getDebugInfo,
  DEFAULT_STABILITY_CONFIG,
} from "../lib/provider-stability";

describe("Provider Stability Guardrails", () => {
  describe("truncateOutput", () => {
    test("under-limit content passes through unchanged", () => {
      const content = "Hello world!";
      const result = truncateOutput(content);

      expect(result.content).toBe(content);
      expect(result.truncated).toBe(false);
      expect(result.originalLength).toBe(content.length);
      expect(result.message).toBeUndefined();
    });

    test("exact boundary content passes through unchanged", () => {
      const content = "x".repeat(DEFAULT_STABILITY_CONFIG.maxChars);
      const result = truncateOutput(content);

      expect(result.content).toBe(content);
      expect(result.truncated).toBe(false);
      expect(result.originalLength).toBe(content.length);
      expect(result.message).toBeUndefined();
    });

    test("over-limit content gets truncated", () => {
      const content = "x".repeat(DEFAULT_STABILITY_CONFIG.maxChars + 100);
      const result = truncateOutput(content);

      expect(result.content.length).toBeLessThan(content.length);
      expect(result.truncated).toBe(true);
      expect(result.originalLength).toBe(content.length);
      expect(result.message).toContain("Output truncated");
      expect(result.message).toContain("token_export");
    });

    test("truncation preserves valid prefix starting with markdown header", () => {
      const content =
        "# Header\n\n" +
        "Some text ".repeat(5000) +
        "\n\n**Important**";

      const result = truncateOutput(content, { maxChars: 100 });

      expect(result.truncated).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(
        100 + 200
      );
      expect(result.content).toMatch(/^# Header/);
    });

    test("custom config overrides default maxChars", () => {
      const content = "x".repeat(100);
      const result = truncateOutput(content, { maxChars: 50 });

      expect(result.truncated).toBe(true);
      expect(result.content).toContain("Output truncated");
      expect(result.originalLength).toBe(100);
    });

    test("truncation message includes original and truncated lengths", () => {
      const content = "x".repeat(25000);
      const result = truncateOutput(content, { maxChars: 10000 });

      expect(result.truncated).toBe(true);
      expect(result.message).toContain("25000");
      expect(result.message).toContain("10000");
    });

    test("empty string passes through", () => {
      const result = truncateOutput("");

      expect(result.content).toBe("");
      expect(result.truncated).toBe(false);
      expect(result.originalLength).toBe(0);
    });
  });

  describe("limitTableRows", () => {
    test("under-limit rows pass through unchanged", () => {
      const rows = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const result = limitTableRows(rows);

      expect(result.rows).toEqual(rows);
      expect(result.truncated).toBe(false);
      expect(result.totalCount).toBe(2);
    });

    test("exact boundary rows pass through unchanged", () => {
      const rows = Array.from(
        { length: DEFAULT_STABILITY_CONFIG.maxTableRows },
        (_, i) => ({ id: i })
      );
      const result = limitTableRows(rows);

      expect(result.rows).toEqual(rows);
      expect(result.truncated).toBe(false);
      expect(result.totalCount).toBe(DEFAULT_STABILITY_CONFIG.maxTableRows);
    });

    test("over-limit rows get truncated", () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const result = limitTableRows(rows);

      expect(result.rows.length).toBe(DEFAULT_STABILITY_CONFIG.maxTableRows);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(100);
    });

    test("custom config overrides default maxTableRows", () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      const result = limitTableRows(rows, { maxTableRows: 10 });

      expect(result.rows.length).toBe(10);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(20);
    });

    test("empty array passes through", () => {
      const result = limitTableRows([]);

      expect(result.rows).toEqual([]);
      expect(result.truncated).toBe(false);
      expect(result.totalCount).toBe(0);
    });

    test("preserves row data structure", () => {
      const rows = [
        { id: 1, name: "Alice", nested: { value: 42 } },
        { id: 2, name: "Bob", nested: { value: 99 } },
      ];
      const result = limitTableRows(rows);

      expect(result.rows[0]).toEqual(rows[0]);
      expect(result.rows[1]).toEqual(rows[1]);
    });
  });

  describe("getDebugInfo", () => {
    test("returns safe diagnostics without content", () => {
      const sections = [
        "# Token Stats\n\nInput: 1000",
        "| Model | Cost |\n|---|---|\n| gpt-4 | $0.50 |",
        "Secret: abc123xyz",
      ];

      const result = getDebugInfo(sections);

      expect(result).toContain("Section 0");
      expect(result).toContain("Section 1");
      expect(result).toContain("Section 2");
      expect(result).toContain("length:");
      expect(result).not.toContain("Secret");
      expect(result).not.toContain("abc123xyz");
      expect(result).not.toContain("gpt-4");
    });

    test("includes length and line counts", () => {
      const sections = ["Line 1\nLine 2\nLine 3", "Short"];

      const result = getDebugInfo(sections);

      expect(result).toContain("length:");
      expect(result).toContain("lines:");
    });

    test("handles empty sections array", () => {
      const result = getDebugInfo([]);

      expect(result).toContain("0 sections");
    });

    test("handles sections with special characters safely", () => {
      const sections = [
        "API_KEY=sk-xxx\nPASSWORD=secret123",
        "Authorization: Bearer token123",
      ];

      const result = getDebugInfo(sections);

      expect(result).not.toContain("sk-xxx");
      expect(result).not.toContain("secret123");
      expect(result).not.toContain("token123");
      expect(result).toContain("length:");
    });
  });

  describe("DEFAULT_STABILITY_CONFIG", () => {
    test("has sensible defaults", () => {
      expect(DEFAULT_STABILITY_CONFIG.maxChars).toBe(20000);
      expect(DEFAULT_STABILITY_CONFIG.maxTableRows).toBe(50);
      expect(DEFAULT_STABILITY_CONFIG.maxChartPoints).toBe(14);
    });
  });
});
