import { describe, expect, test } from "bun:test";
import { renderBarChart, renderSparkline } from "../lib/ascii-charts";

describe("renderBarChart", () => {
  test("should render deterministic bar chart", () => {
    const values = [10, 20, 15];
    const labels = ["Day 1", "Day 2", "Day 3"];

    const chart = renderBarChart(values, labels);

    expect(chart).toContain("Day 1");
    expect(chart).toContain("Day 2");
    expect(chart).toContain("Day 3");
    expect(chart).toContain("#");
  });

  test("should handle empty array", () => {
    const chart = renderBarChart([], []);

    expect(chart).toBe("");
  });

  test("should respect maxPoints limit", () => {
    const values = Array(20).fill(10);
    const labels = Array(20)
      .fill(0)
      .map((_, i) => `Day ${i + 1}`);

    const chart = renderBarChart(values, labels, { maxPoints: 5 });

    const lines = chart.split("\n").filter(line => line.trim() !== "");
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  test("should handle all same values", () => {
    const values = [5, 5, 5];
    const labels = ["A", "B", "C"];

    const chart = renderBarChart(values, labels);

    expect(chart).toContain("A");
    expect(chart).toContain("B");
    expect(chart).toContain("C");
  });

  test("should scale bars proportionally", () => {
    const values = [10, 20, 30];
    const labels = ["A", "B", "C"];

    const chart = renderBarChart(values, labels, { width: 30 });

    const lines = chart.split("\n");
    const barA = lines.find(l => l.includes("A"));
    const barB = lines.find(l => l.includes("B"));
    const barC = lines.find(l => l.includes("C"));

    expect(barA).toBeDefined();
    expect(barB).toBeDefined();
    expect(barC).toBeDefined();

    const countHashes = (str: string | undefined) =>
      str ? (str.match(/#/g) || []).length : 0;

    const hashesA = countHashes(barA);
    const hashesB = countHashes(barB);
    const hashesC = countHashes(barC);

    expect(hashesC).toBeGreaterThan(hashesB);
    expect(hashesB).toBeGreaterThan(hashesA);
  });

  test("should handle labels longer than values", () => {
    const values = [10, 20];
    const labels = ["A", "B", "C"];

    const chart = renderBarChart(values, labels);

    expect(chart).toContain("A");
    expect(chart).toContain("B");
    expect(chart).not.toContain("C");
  });

  test("should handle values longer than labels", () => {
    const values = [10, 20, 30];
    const labels = ["A", "B"];

    const chart = renderBarChart(values, labels);

    const lines = chart.split("\n").filter(l => l.trim() !== "");
    expect(lines.length).toBe(2);
  });
});

describe("renderSparkline", () => {
  test("should render stable sparkline", () => {
    const values = [1, 2, 3, 4, 5];

    const sparkline = renderSparkline(values);

    expect(sparkline.length).toBeGreaterThan(0);
    expect(typeof sparkline).toBe("string");
  });

  test("should handle empty array", () => {
    const sparkline = renderSparkline([]);

    expect(sparkline).toBe("");
  });

  test("should handle single value", () => {
    const sparkline = renderSparkline([10]);

    expect(sparkline.length).toBeGreaterThan(0);
  });

  test("should respect maxPoints limit", () => {
    const values = Array(20).fill(10);

    const sparkline = renderSparkline(values, { maxPoints: 5 });

    expect(sparkline.length).toBeLessThanOrEqual(5);
  });

  test("should handle all same values", () => {
    const values = [5, 5, 5, 5, 5];

    const sparkline = renderSparkline(values);

    expect(sparkline.length).toBeGreaterThan(0);
  });

  test("should produce different output for different values", () => {
    const values1 = [1, 2, 3, 4, 5];
    const values2 = [5, 4, 3, 2, 1];

    const sparkline1 = renderSparkline(values1);
    const sparkline2 = renderSparkline(values2);

    expect(sparkline1).not.toBe(sparkline2);
  });

  test("should be deterministic", () => {
    const values = [1, 5, 3, 8, 2];

    const sparkline1 = renderSparkline(values);
    const sparkline2 = renderSparkline(values);

    expect(sparkline1).toBe(sparkline2);
  });
});
