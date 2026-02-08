import type { topNAgents } from "./aggregation";
import { limitTableRows } from "./provider-stability";
import type {
  TokenStats,
  TokenStatsByAgentModel,
  TokenStatsByModel,
  ToolAttributionResult,
} from "./types";

type TopNAgentsResult = ReturnType<typeof topNAgents>;

export function renderHeader(
  sessionID: string,
  models: string[],
  isAntigravity: boolean,
  isCompact: boolean
): string {
  let output = "# Token Usage Statistics\n\n";
  output += `**Session:** ${sessionID}\n`;
  output += `**Models:** ${models.join(", ")}\n\n`;

  if (isAntigravity && !isCompact) {
    output += "_ℹ️ Compact mode auto-applied for Antigravity provider._\n\n";
  }

  return output;
}

export function renderTotals(totalStats: TokenStats): string {
  let output = "## Totals\n";
  output += `- Input: ${totalStats.input.toLocaleString()} tokens\n`;
  output += `- Output: ${totalStats.output.toLocaleString()} tokens\n`;
  output += `- Total: ${totalStats.total.toLocaleString()} tokens\n`;
  output += `- Reasoning: ${totalStats.reasoning.toLocaleString()} tokens\n`;
  output += `- Cache (read/write): ${totalStats.cache.read.toLocaleString()}/${totalStats.cache.write.toLocaleString()} tokens\n\n`;
  return output;
}

export function renderEstimatedCost(totalCost: number): string {
  return `## Estimated Cost\n- Total: $${totalCost.toFixed(4)}\n\n`;
}

export function renderModelTable(
  statsByModel: TokenStatsByModel,
  costByModel: Record<string, number>
): string {
  let output = "## Per-Model Breakdown\\n";
  output += "| Model | Input | Output | Total | Cost |\\n";
  output += "|-------|-------|--------|-------|------|\\n";

  const modelEntries = Object.entries(statsByModel) as Array<[string, TokenStats]>;
  const {
    rows: limitedModels,
    truncated: modelsTruncated,
    totalCount: modelsTotal,
  } = limitTableRows(modelEntries);

  for (const [model, stats] of limitedModels) {
    const cost = costByModel[model] || 0;
    output += `| ${model} | ${stats.input.toLocaleString()} | ${stats.output.toLocaleString()} | ${stats.total.toLocaleString()} | $${cost.toFixed(4)} |\\n`;
  }

  if (modelsTruncated) {
    output += `\\n_...and ${modelsTotal - limitedModels.length} more rows. Use \`token_export\` for full data._\\n`;
  }

  return output;
}

export function renderAgentTable(
  title: string,
  rows: TopNAgentsResult,
  totalCost: number
): string {
  let output = `\n## ${title}\n`;
  output += "| Agent | Input | Output | Total | Msgs | Cost | %Cost |\n";
  output += "|-------|-------|--------|-------|------|------|-------|\n";

  for (const row of rows.rows) {
    const pctCost = totalCost > 0 ? `${((row.cost / totalCost) * 100).toFixed(1)}%` : "-";
    output += `| ${row.agent} | ${row.stats.input.toLocaleString()} | ${row.stats.output.toLocaleString()} | ${row.stats.total.toLocaleString()} | ${row.stats.messageCount} | $${row.cost.toFixed(4)} | ${pctCost} |\n`;
  }

  if (rows.others) {
    const pctCost = totalCost > 0 ? `${((rows.others.cost / totalCost) * 100).toFixed(1)}%` : "-";
    output += `| Others (${rows.others.count}) | ${rows.others.stats.input.toLocaleString()} | ${rows.others.stats.output.toLocaleString()} | ${rows.others.stats.total.toLocaleString()} | ${rows.others.stats.messageCount} | $${rows.others.cost.toFixed(4)} | ${pctCost} |\n`;
  }

  return output;
}

export function renderAgentModelTable(
  statsByAgentModel: TokenStatsByAgentModel,
  totalCost: number
): string {
  let output = "\n## Agent × Model\n";
  output += "| Agent | Model | Msgs | Input | Output | Total | Cost | %Cost |\n";
  output += "|-------|-------|------|-------|--------|-------|------|-------|\n";

  const rows = Object.values(statsByAgentModel)
    .map((entry) => ({
      ...entry,
      cost: (entry as typeof entry & { cost?: number }).cost || 0,
    }))
    .sort((a, b) => {
      if (b.cost !== a.cost) {
        return b.cost - a.cost;
      }
      const agentCmp = a.agent.localeCompare(b.agent);
      if (agentCmp !== 0) {
        return agentCmp;
      }
      return a.model.localeCompare(b.model);
    });

  const { rows: limitedRows, truncated, totalCount } = limitTableRows(rows);

  for (const row of limitedRows) {
    const pctCost = totalCost > 0 ? `${((row.cost / totalCost) * 100).toFixed(1)}%` : "-";
    output += `| ${row.agent} | ${row.model} | ${row.messageCount} | ${row.input.toLocaleString()} | ${row.output.toLocaleString()} | ${row.total.toLocaleString()} | $${row.cost.toFixed(4)} | ${pctCost} |\n`;
  }

  if (truncated) {
    output += `\n_...and ${totalCount - limitedRows.length} more rows. Use \`token_export\` for full data._\n`;
  }

  return output;
}

export function renderToolCommandTable(
  attribution: ToolAttributionResult,
  totalCost: number
): string {
  const rows = Object.values(attribution.byTool);
  if (rows.length === 0) {
    return "";
  }

  let output = "\n## Tool × Command\n";
  output += "| Tool | Summary | Calls | Input | Output | Total | Cost | %Cost |\n";
  output += "|------|---------|-------|-------|--------|-------|------|-------|\n";

  const sortedRows = [...rows].sort((a, b) => {
    if (b.cost !== a.cost) {
      return b.cost - a.cost;
    }
    return a.tool.localeCompare(b.tool);
  });

  const { rows: limitedRows, truncated, totalCount } = limitTableRows(sortedRows);

  for (const row of limitedRows) {
    const pctCost = totalCost > 0 ? `${((row.cost / totalCost) * 100).toFixed(1)}%` : "-";
    output += `| ${row.tool} | ${row.title} | ${row.callCount} | ${row.tokens.input.toLocaleString()} | ${row.tokens.output.toLocaleString()} | ${row.tokens.total.toLocaleString()} | $${row.cost.toFixed(4)} | ${pctCost} |\n`;
  }

  if (truncated) {
    output += `\n_...and ${totalCount - limitedRows.length} more rows. Use \`token_export\` for full data._\n`;
  }

  return output;
}

export function renderWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  let output = "\n## Warnings\n";
  for (const warning of warnings) {
    output += `- ${warning}\n`;
  }
  return output;
}
