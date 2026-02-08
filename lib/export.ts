import type { SessionRecord } from "./types";

export type ExportFormat = "json" | "csv" | "markdown";
export type ExportScope = "session" | "range";

export interface ExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  sessionID?: string;
  from?: Date;
  to?: Date;
  includeChildren?: boolean;
}

export function exportToJSON(records: SessionRecord[]): string {
  return JSON.stringify(records, null, 2);
}

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function exportToCSV(records: SessionRecord[]): string {
  const header = "sessionID,projectID,timestamp,input,output,total,reasoning,cache_read,cache_write,cost";
  
  if (records.length === 0) {
    return header;
  }

  const rows = records.map((record) => {
    const sessionID = escapeCSVField(record.sessionID);
    const projectID = escapeCSVField(record.projectID ?? "");
    const timestamp = new Date(record.timestamp).toISOString();
    const input = record.totals.input;
    const output = record.totals.output;
    const total = record.totals.total;
    const reasoning = record.totals.reasoning;
    const cacheRead = record.totals.cache.read;
    const cacheWrite = record.totals.cache.write;
    const cost = record.cost;

    return `${sessionID},${projectID},${timestamp},${input},${output},${total},${reasoning},${cacheRead},${cacheWrite},${cost}`;
  });

  return [header, ...rows].join("\n");
}

export function exportToMarkdown(records: SessionRecord[]): string {
  let output = "| Session ID | Project ID | Date | Input | Output | Total | Reasoning | Cache R/W | Cost |\n";
  output += "|------------|------------|------|-------|--------|-------|-----------|-----------|------|\n";

  if (records.length === 0) {
    output += "\nNo records to display\n";
    return output;
  }

  for (const record of records) {
    const sessionIDShort = record.sessionID.substring(0, 10) + "...";
    const projectIDShort = record.projectID ? record.projectID.substring(0, 10) + "..." : "—";
    const date = new Date(record.timestamp).toISOString().split("T")[0];
    const input = record.totals.input.toLocaleString();
    const output_tokens = record.totals.output.toLocaleString();
    const total = record.totals.total.toLocaleString();
    const reasoning = record.totals.reasoning.toLocaleString();
    const cacheRW = `${record.totals.cache.read}/${record.totals.cache.write}`;
    const cost = `$${record.cost.toFixed(4)}`;

    output += `| ${sessionIDShort} | ${projectIDShort} | ${date} | ${input} | ${output_tokens} | ${total} | ${reasoning} | ${cacheRW} | ${cost} |\n`;
  }

  return output;
}

export function exportData(records: SessionRecord[], format: ExportFormat): string {
  switch (format) {
    case "json":
      return exportToJSON(records);
    case "csv":
      return exportToCSV(records);
    case "markdown":
      return exportToMarkdown(records);
  }
}
