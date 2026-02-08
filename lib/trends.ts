import type { SessionRecord } from "./types";

export type DailyBucket = {
  date: string; // YYYY-MM-DD
  cost: number;
  tokens: number;
  sessions: number;
};

export type TrendStats = {
  buckets: DailyBucket[];
  weekOverWeekDelta: number; // percentage change
  spikes: string[]; // dates of spike days
};

export function bucketByDay(records: SessionRecord[]): DailyBucket[] {
  if (records.length === 0) {
    return [];
  }

  const bucketMap = new Map<string, DailyBucket>();

  for (const record of records) {
    const date = new Date(record.timestamp);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    const existing = bucketMap.get(dateKey);
    if (existing) {
      existing.cost += record.cost;
      existing.tokens += record.totals.total;
      existing.sessions += 1;
    } else {
      bucketMap.set(dateKey, {
        date: dateKey,
        cost: record.cost,
        tokens: record.totals.total,
        sessions: 1,
      });
    }
  }

  const buckets = Array.from(bucketMap.values());
  buckets.sort((a, b) => a.date.localeCompare(b.date));

  return buckets;
}

export function computeWeekOverWeek(buckets: DailyBucket[]): number {
  if (buckets.length < 14) {
    return 0;
  }

  const last7 = buckets.slice(-7);
  const prev7 = buckets.slice(-14, -7);

  const currentWeekTotal = last7.reduce((sum, bucket) => sum + bucket.cost, 0);
  const prevWeekTotal = prev7.reduce((sum, bucket) => sum + bucket.cost, 0);

  if (prevWeekTotal === 0) {
    return 0;
  }

  return (currentWeekTotal - prevWeekTotal) / prevWeekTotal;
}

export function detectSpikes(
  buckets: DailyBucket[],
  threshold = 2.0
): string[] {
  if (buckets.length <= 1) {
    return [];
  }

  const costs = buckets.map(b => b.cost);
  const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;

  const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - mean, 2), 0) / costs.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return [];
  }

  const spikes: string[] = [];
  for (const bucket of buckets) {
    const zScore = (bucket.cost - mean) / stdDev;
    if (zScore > threshold) {
      spikes.push(bucket.date);
    }
  }

  return spikes;
}

export function analyzeTrends(records: SessionRecord[]): TrendStats {
  const buckets = bucketByDay(records);
  return {
    buckets,
    weekOverWeekDelta: computeWeekOverWeek(buckets),
    spikes: detectSpikes(buckets),
  };
}
