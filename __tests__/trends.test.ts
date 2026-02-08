import { describe, expect, test } from "bun:test";
import {
  bucketByDay,
  computeWeekOverWeek,
  detectSpikes,
  analyzeTrends,
  type DailyBucket,
} from "../lib/trends";
import type { SessionRecord } from "../lib/types";

describe("bucketByDay", () => {
  test("should bucket multiple sessions on same day", () => {
    const records: SessionRecord[] = [
      {
        sessionID: "ses_1",
        timestamp: new Date("2026-02-01T10:00:00Z").getTime(),
        totals: {
          input: 100,
          output: 50,
          total: 150,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 1.0,
      },
      {
        sessionID: "ses_2",
        timestamp: new Date("2026-02-01T15:00:00Z").getTime(),
        totals: {
          input: 200,
          output: 100,
          total: 300,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 2.0,
      },
    ];

    const buckets = bucketByDay(records);

    expect(buckets).toEqual([
      {
        date: "2026-02-01",
        cost: 3.0,
        tokens: 450,
        sessions: 2,
      },
    ]);
  });

  test("should create separate buckets for different days", () => {
    const records: SessionRecord[] = [
      {
        sessionID: "ses_1",
        timestamp: new Date("2026-02-01T10:00:00Z").getTime(),
        totals: {
          input: 100,
          output: 50,
          total: 150,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 1.0,
      },
      {
        sessionID: "ses_2",
        timestamp: new Date("2026-02-02T10:00:00Z").getTime(),
        totals: {
          input: 200,
          output: 100,
          total: 300,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 2.0,
      },
      {
        sessionID: "ses_3",
        timestamp: new Date("2026-02-03T10:00:00Z").getTime(),
        totals: {
          input: 150,
          output: 75,
          total: 225,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 1.5,
      },
    ];

    const buckets = bucketByDay(records);

    expect(buckets).toEqual([
      { date: "2026-02-01", cost: 1.0, tokens: 150, sessions: 1 },
      { date: "2026-02-02", cost: 2.0, tokens: 300, sessions: 1 },
      { date: "2026-02-03", cost: 1.5, tokens: 225, sessions: 1 },
    ]);
  });

  test("should handle empty input", () => {
    const buckets = bucketByDay([]);
    expect(buckets).toEqual([]);
  });

  test("should sort buckets chronologically", () => {
    const records: SessionRecord[] = [
      {
        sessionID: "ses_3",
        timestamp: new Date("2026-02-03T10:00:00Z").getTime(),
        totals: {
          input: 150,
          output: 75,
          total: 225,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 1.5,
      },
      {
        sessionID: "ses_1",
        timestamp: new Date("2026-02-01T10:00:00Z").getTime(),
        totals: {
          input: 100,
          output: 50,
          total: 150,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 1.0,
      },
    ];

    const buckets = bucketByDay(records);

    expect(buckets.length).toBe(2);
    expect(buckets[0]?.date).toBe("2026-02-01");
    expect(buckets[1]?.date).toBe("2026-02-03");
  });
});

describe("computeWeekOverWeek", () => {
  test("should calculate positive week-over-week delta", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-01-25", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-01-26", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-01-27", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-01-28", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-01-29", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-01-30", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-01-31", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-01", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-02-02", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-02-03", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-02-04", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-02-05", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-02-06", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-02-07", cost: 2.0, tokens: 2000, sessions: 1 },
    ];

    const delta = computeWeekOverWeek(buckets);

    expect(delta).toBeCloseTo(1.0, 5);
  });

  test("should calculate negative week-over-week delta", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-01-25", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-01-26", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-01-27", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-01-28", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-01-29", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-01-30", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-01-31", cost: 2.0, tokens: 2000, sessions: 1 },
      { date: "2026-02-01", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-02", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-03", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-04", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-05", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-06", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-07", cost: 1.0, tokens: 1000, sessions: 1 },
    ];

    const delta = computeWeekOverWeek(buckets);

    expect(delta).toBeCloseTo(-0.5, 5);
  });

  test("should return 0 when not enough data", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-02-01", cost: 1.0, tokens: 1000, sessions: 1 },
    ];

    const delta = computeWeekOverWeek(buckets);

    expect(delta).toBe(0);
  });

  test("should handle zero previous week cost", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-01-25", cost: 0, tokens: 0, sessions: 0 },
      { date: "2026-01-26", cost: 0, tokens: 0, sessions: 0 },
      { date: "2026-01-27", cost: 0, tokens: 0, sessions: 0 },
      { date: "2026-01-28", cost: 0, tokens: 0, sessions: 0 },
      { date: "2026-01-29", cost: 0, tokens: 0, sessions: 0 },
      { date: "2026-01-30", cost: 0, tokens: 0, sessions: 0 },
      { date: "2026-01-31", cost: 0, tokens: 0, sessions: 0 },
      { date: "2026-02-01", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-02", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-03", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-04", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-05", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-06", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-07", cost: 1.0, tokens: 1000, sessions: 1 },
    ];

    const delta = computeWeekOverWeek(buckets);

    expect(delta).toBe(0);
  });
});

describe("detectSpikes", () => {
  test("should detect spike days using z-score", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-02-01", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-02", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-03", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-04", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-05", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-06", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-07", cost: 15.0, tokens: 15000, sessions: 1 },
      { date: "2026-02-08", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-09", cost: 1.0, tokens: 1000, sessions: 1 },
    ];

    const spikes = detectSpikes(buckets, 2.0);

    expect(spikes).toContain("2026-02-07");
    expect(spikes.length).toBe(1);
  });

  test("should return empty array when no spikes", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-02-01", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-02", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-03", cost: 1.0, tokens: 1000, sessions: 1 },
    ];

    const spikes = detectSpikes(buckets);

    expect(spikes).toEqual([]);
  });

  test("should handle empty input", () => {
    const spikes = detectSpikes([]);
    expect(spikes).toEqual([]);
  });

  test("should handle single data point", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-02-01", cost: 1.0, tokens: 1000, sessions: 1 },
    ];

    const spikes = detectSpikes(buckets);

    expect(spikes).toEqual([]);
  });

  test("should handle all same values", () => {
    const buckets: DailyBucket[] = [
      { date: "2026-02-01", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-02", cost: 1.0, tokens: 1000, sessions: 1 },
      { date: "2026-02-03", cost: 1.0, tokens: 1000, sessions: 1 },
    ];

    const spikes = detectSpikes(buckets);

    expect(spikes).toEqual([]);
  });
});

describe("analyzeTrends", () => {
  test("should combine all trend analysis functions", () => {
    const records: SessionRecord[] = [
      {
        sessionID: "ses_1",
        timestamp: new Date("2026-01-25T10:00:00Z").getTime(),
        totals: {
          input: 100,
          output: 50,
          total: 150,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 1.0,
      },
      {
        sessionID: "ses_2",
        timestamp: new Date("2026-02-01T10:00:00Z").getTime(),
        totals: {
          input: 1000,
          output: 500,
          total: 1500,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        byModel: {},
        cost: 10.0,
      },
    ];

    const trends = analyzeTrends(records);

    expect(trends.buckets.length).toBeGreaterThan(0);
    expect(trends.weekOverWeekDelta).toBeDefined();
    expect(Array.isArray(trends.spikes)).toBe(true);
  });

  test("should handle empty records", () => {
    const trends = analyzeTrends([]);

    expect(trends.buckets).toEqual([]);
    expect(trends.weekOverWeekDelta).toBe(0);
    expect(trends.spikes).toEqual([]);
  });
});
