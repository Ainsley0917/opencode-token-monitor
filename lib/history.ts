import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SessionRecord } from "./types";

export function getShardPath(date: Date, baseDir?: string): string {
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid date passed to getShardPath: ${date}`);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const filename = `${year}-${month}.json`;

  const dir = baseDir 
    ? baseDir
    : resolveBaseDir();

  return join(dir, filename);
}

function resolveBaseDir(): string {
  const searchPaths = [
    join(process.cwd(), "token-history"),
    join(homedir(), ".opencode", "token-history"),
    join(homedir(), ".config", "opencode", "token-history"),
  ];

  for (const path of searchPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return join(homedir(), ".opencode", "token-history");
}

export async function saveSessionRecord(
  record: SessionRecord, 
  baseDir?: string
): Promise<void> {
  if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp)) {
    throw new Error(`Invalid timestamp for session ${record.sessionID}: ${record.timestamp}`);
  }
  const shardPath = getShardPath(new Date(record.timestamp), baseDir);
  const dir = shardPath.substring(0, shardPath.lastIndexOf("/"));

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let records: SessionRecord[] = [];

  if (existsSync(shardPath)) {
    try {
      const content = readFileSync(shardPath, "utf-8");
      records = JSON.parse(content);
      if (!Array.isArray(records)) {
        console.warn(`Shard ${shardPath} does not contain an array, resetting to empty array`);
        records = [];
      }
    } catch (error) {
      console.warn(`Failed to parse ${shardPath}, resetting to empty array:`, error);
      records = [];
    }
  }

  const existingIndex = records.findIndex(r => r.sessionID === record.sessionID);
  if (existingIndex !== -1) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }

  const tempPath = `${shardPath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(records, null, 2), "utf-8");
  renameSync(tempPath, shardPath);
}

export async function loadHistoryForRange(
  from: Date,
  to: Date,
  baseDir?: string,
  projectID?: string
): Promise<SessionRecord[]> {
  const allRecords: SessionRecord[] = [];
  
  const shards = getShardsBetween(from, to);
  
  for (const shardDate of shards) {
    const shardPath = getShardPath(shardDate, baseDir);
    
    if (!existsSync(shardPath)) {
      continue;
    }

    try {
      const content = readFileSync(shardPath, "utf-8");
      const records: SessionRecord[] = JSON.parse(content);
      
      if (!Array.isArray(records)) {
        console.warn(`Shard ${shardPath} does not contain an array, skipping`);
        continue;
      }

      for (const record of records) {
        if (record.timestamp >= from.getTime() && record.timestamp <= to.getTime()) {
          if (projectID !== undefined) {
            if (record.projectID === projectID) {
              allRecords.push(record);
            }
          } else {
            allRecords.push(record);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse ${shardPath}, skipping:`, error);
    }
  }

  allRecords.sort((a, b) => a.timestamp - b.timestamp);
  
  return allRecords;
}

function getShardsBetween(from: Date, to: Date): Date[] {
  const shards: Date[] = [];
  
  const current = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  while (current <= end) {
    shards.push(new Date(current));
    current.setMonth(current.getMonth() + 1);
  }

  return shards;
}
