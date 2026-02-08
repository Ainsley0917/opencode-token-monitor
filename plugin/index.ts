import { tool, type Plugin, type PluginInput } from "@opencode-ai/plugin";
import {
  aggregateTokens,
  aggregateToolAttribution,
  aggregateTokensByModel,
  aggregateTokensByAgent,
  aggregateTokensByAgentModel,
  aggregateTokensByInitiator,
  topNAgents,
} from "../lib/aggregation";
import { calculateCost, loadPricingConfig } from "../lib/cost-calculator";
import { loadHistoryForRange, saveSessionRecord } from "../lib/history";
import { exportData, type ExportFormat } from "../lib/export";
import { truncateOutput, getDebugInfo, limitTableRows } from "../lib/provider-stability";
import {
  renderAgentTable,
  renderAgentModelTable,
  renderEstimatedCost,
  renderHeader,
  renderModelTable,
  renderToolCommandTable,
  renderTotals,
  renderWarnings,
} from "../lib/renderer";
import { loadAntigravityQuota } from "../lib/quota";
import { loadBudgetConfig, getBudgetStatus, formatBudgetSection } from "../lib/budget";
import { generateOptimizationSuggestions, formatOptimizationSection } from "../lib/optimization";
import { analyzeTrends } from "../lib/trends";
import { renderBarChart } from "../lib/ascii-charts";
import { listSessionTree, aggregateSessionTree, type SessionNode } from "../lib/session-tree";
import { shouldShowToast, updateState, resetState } from "../lib/notifications";
import type { AssistantMessage, UserMessage, PriceConfig } from "../lib/types";
import { writeFileSync } from "fs";

const inFlightSessions = new Set<string>();

export function getInFlightCount(): number {
  return inFlightSessions.size;
}

function computeCostMapFromAgentModel(
  statsByAgentModel: ReturnType<typeof aggregateTokensByAgentModel>,
  customPricing: PriceConfig
): Record<string, number> {
  const costMap: Record<string, number> = {};

  for (const entry of Object.values(statsByAgentModel)) {
    const modelCost = calculateCost(
      {
        [entry.model]: {
          input: entry.input,
          output: entry.output,
          total: entry.total,
          reasoning: entry.reasoning,
          cache: {
            read: entry.cache.read,
            write: entry.cache.write,
          },
        },
      },
      customPricing
    ).totalCost;

    costMap[entry.agent] = (costMap[entry.agent] || 0) + modelCost;
  }

  return costMap;
}

function computeAgentCosts(
  assistantMessages: AssistantMessage[],
  customPricing: PriceConfig
): Record<string, number> {
  const statsByAgentModel = aggregateTokensByAgentModel(assistantMessages);
  return computeCostMapFromAgentModel(statsByAgentModel, customPricing);
}

function computeInitiatorCosts(
  assistantMessages: AssistantMessage[],
  userMessages: UserMessage[],
  customPricing: PriceConfig
): Record<string, number> {
  const parentIdToAgent = new Map<string, string>();
  for (const userMsg of userMessages) {
    parentIdToAgent.set(userMsg.id, userMsg.agent);
  }

  const initiatorAttributedMessages = assistantMessages.map((msg) => {
    const userAgent = parentIdToAgent.get(msg.parentID);
    const initiatorKey = userAgent && userAgent.trim() !== "" ? userAgent : "unknown";
    return {
      ...msg,
      mode: initiatorKey,
    };
  });

  const statsByInitiatorAgentModel = aggregateTokensByAgentModel(initiatorAttributedMessages);
  return computeCostMapFromAgentModel(statsByInitiatorAgentModel, customPricing);
}

export default async function (input: PluginInput): Promise<ReturnType<Plugin>> {
  return {
    tool: {
      token_history: tool({
        description: "Query token history for date range",
        args: {
          from: tool.schema.string().optional().describe("Start date (ISO: 2026-01-01)"),
          to: tool.schema.string().optional().describe("End date (ISO: 2026-02-07)"),
          scope: tool.schema.string().optional().describe("Scope: project or all (default: all)"),
        },
        async execute(args, _context) {
          try {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const fromDate = args.from ? new Date(args.from) : thirtyDaysAgo;
            const toDate = args.to ? new Date(args.to) : now;

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
              return "Error: Invalid date format. Please use ISO format (e.g., 2026-01-01)";
            }

            const scope = args.scope ?? "all";
            const projectID = scope === "project" ? input.project?.id : undefined;
            const records = await loadHistoryForRange(fromDate, toDate, undefined, projectID);

            if (records.length === 0) {
              const scopeLabel = scope === "project" ? `project (${input.project?.id ?? "unknown"})` : "all";
              return `# Token Usage History\n\n**Scope:** ${scopeLabel}\n\nNo session records found between ${fromDate.toISOString().split('T')[0]} and ${toDate.toISOString().split('T')[0]}.`;
            }

            let output = `# Token Usage History\n\n`;
            output += `**Period:** ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}\n`;
            output += `**Scope:** ${scope}${scope === "project" ? ` (${input.project?.id ?? "unknown"})` : ""}\n`;
            output += `**Sessions:** ${records.length}\n\n`;

            const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
            const totalTokens = records.reduce((sum, r) => sum + r.totals.total, 0);

            output += `## Summary\n`;
            output += `- Total Cost: $${totalCost.toFixed(4)}\n`;
            output += `- Total Tokens: ${totalTokens.toLocaleString()}\n\n`;

            output += `## Sessions\\n`;
            output += `| Date | Session ID | Tokens | Cost |\\n`;
            output += `|------|------------|--------|------|\\n`;
            
            const { rows: limitedRecords, truncated: recordsTruncated, totalCount: recordsTotal } = limitTableRows(records);
            for (const record of limitedRecords) {
              const date = new Date(record.timestamp).toISOString().split('T')[0];
              const sessionIDShort = record.sessionID.substring(0, 12);
              output += `| ${date} | ${sessionIDShort}... | ${record.totals.total.toLocaleString()} | $${record.cost.toFixed(4)} |\\n`;
            }
            if (recordsTruncated) {
              output += `\\n_...and ${recordsTotal - limitedRecords.length} more rows. Use \`token_export\` for full data._\\n`;
            }

            try {
              const trends = analyzeTrends(records);
              if (trends.buckets.length > 0) {
                output += `\n## Trend Analysis\n\n`;
                
                const costValues = trends.buckets.map(b => b.cost);
                const dateLabels = trends.buckets.map(b => b.date.substring(5));
                const chart = renderBarChart(costValues, dateLabels);
                if (chart) {
                  output += `### Daily Cost Trend\n\`\`\`\n${chart}\n\`\`\`\n\n`;
                }

                if (trends.weekOverWeekDelta !== 0) {
                  const direction = trends.weekOverWeekDelta > 0 ? "increased" : "decreased";
                  const percentage = Math.abs(trends.weekOverWeekDelta * 100).toFixed(1);
                  output += `**Week-over-week:** ${direction} by ${percentage}%\n\n`;
                }

                if (trends.spikes.length > 0) {
                  output += `**Cost spikes detected:** ${trends.spikes.join(", ")}\n\n`;
                }
              }
            } catch {
            }

            const result = truncateOutput(output);
            return result.content;
          } catch (error) {
            return `Error loading token history: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
      token_export: tool({
        description: "Export token data (JSON/CSV/Markdown)",
        args: {
          format: tool.schema
            .enum(["json", "csv", "markdown"])
            .describe("Format: json, csv, markdown"),
          scope: tool.schema
            .enum(["session", "range"])
            .optional()
            .describe("Scope: session or range"),
          session_id: tool.schema
            .string()
            .optional()
            .describe("Session ID (default: current)"),
          from: tool.schema
            .string()
            .optional()
            .describe("Start date (ISO: 2026-01-01)"),
          to: tool.schema
            .string()
            .optional()
            .describe("End date (ISO: 2026-02-07)"),
          include_children: tool.schema
            .boolean()
            .optional()
            .describe("Include child sessions"),
          file_path: tool.schema
            .string()
            .optional()
            .describe("File path (optional)"),
          history_scope: tool.schema
            .enum(["project", "all"])
            .optional()
            .describe("History scope: project or all (default: all, range mode only)"),
        },
        async execute(args, context) {
          try {
            const scope = args.scope ?? "session";
            const format = args.format as ExportFormat;
            
            let records;

            if (scope === "session") {
              const sessionID = args.session_id ?? context.sessionID;
              
              const response = await input.client.session.messages({
                path: { id: sessionID },
              });

              if (response.error) {
                return `Error fetching session messages: ${response.error}`;
              }

              const messages = response.data || [];
              const assistantMessages: AssistantMessage[] = messages
                .filter((msg) => msg.info.role === "assistant")
                .map((msg) => msg.info as AssistantMessage);

              if (assistantMessages.length === 0) {
                return "No assistant messages found in this session.";
              }

              const totals = aggregateTokens(assistantMessages);
              const byModel = aggregateTokensByModel(assistantMessages);
              const customPricing = loadPricingConfig();
              const costResult = calculateCost(byModel, customPricing);

              records = [
                {
                  sessionID,
                  projectID: input.project?.id,
                  timestamp: Date.now(),
                  totals,
                  byModel,
                  cost: costResult.totalCost,
                },
              ];
            } else {
              const now = new Date();
              const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              
              const fromDate = args.from ? new Date(args.from) : thirtyDaysAgo;
              const toDate = args.to ? new Date(args.to) : now;

              if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                return "Error: Invalid date format. Please use ISO format (e.g., 2026-01-01)";
              }

              const historyScope = args.history_scope ?? "all";
              const projectIDFilter = historyScope === "project" ? input.project?.id : undefined;
              
              records = await loadHistoryForRange(fromDate, toDate, undefined, projectIDFilter);

              if (records.length === 0) {
                return `No session records found between ${fromDate.toISOString().split('T')[0]} and ${toDate.toISOString().split('T')[0]}.`;
              }
            }

            const content = exportData(records, format);

            if (args.file_path) {
              writeFileSync(args.file_path, content, "utf-8");
              return `Successfully exported ${records.length} record(s) to ${args.file_path}`;
            }

            const INLINE_THRESHOLD = 10000;
            if (content.length > INLINE_THRESHOLD) {
              const timestamp = new Date().toISOString().split('T')[0];
              const extension = format === "json" ? "json" : format === "csv" ? "csv" : "md";
              const autoPath = `./token-export-${timestamp}.${extension}`;
              
              writeFileSync(autoPath, content, "utf-8");
              const sizeBytes = Buffer.byteLength(content, "utf-8");
              return `Export written to ${autoPath} (${sizeBytes} bytes). Content too large for inline display.`;
            }

            const result = truncateOutput(content);
            return result.content;
          } catch (error) {
            return `Error exporting data: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
      token_stats: tool({
        description: "Show token usage for current session",
        args: {
          session_id: tool.schema
            .string()
            .optional()
            .describe("Session ID (default: current)"),
          include_children: tool.schema
            .boolean()
            .optional()
            .describe("Include child sessions"),
          trend_days: tool.schema
            .number()
            .optional()
            .describe("Trend days (default: 7)"),
          compact: tool.schema
            .boolean()
            .optional()
            .describe("Skip heavy sections"),
          debug: tool.schema
            .boolean()
            .optional()
            .describe("Include debug info"),
          agent_view: tool.schema
            .string()
            .optional()
            .describe("Agent view: execution, initiator, or both (default: both)"),
          agent_sort: tool.schema
            .string()
            .optional()
            .describe("Sort agent tables by: cost or tokens (default: cost)"),
          agent_top_n: tool.schema
            .number()
            .optional()
            .describe("Top N agents to show (default: 10, 0 disables)"),
          scope: tool.schema
            .string()
            .optional()
            .describe("Scope: project or all (default: all)"),
        },
        async execute(args, context) {
          const sessionID = args.session_id ?? context.sessionID;
          const scope = args.scope ?? "all";

          try {
            const response = await input.client.session.messages({
              path: { id: sessionID },
            });

            if (response.error) {
              return `Error fetching session messages: ${response.error}`;
            }

            const messages = response.data || [];

            let assistantMessages: AssistantMessage[] = messages
              .filter((msg) => msg.info.role === "assistant")
              .map((msg) => msg.info as AssistantMessage);

            const rootAssistantParts = messages
              .filter((msg) => msg.info.role === "assistant")
              .flatMap((msg) => msg.parts || []);
            let allParts: any[] = [...rootAssistantParts];

            let userMessages: UserMessage[] = messages
              .filter((msg) => msg.info.role === "user")
              .map((msg) => msg.info as UserMessage);

            let sessionTree: SessionNode | undefined;
            if (args.include_children) {
              const flattenAssistantMessages = (node: SessionNode): AssistantMessage[] => {
                const all: AssistantMessage[] = [...node.messages];
                for (const child of node.children) {
                  all.push(...flattenAssistantMessages(child));
                }
                return all;
              };

              const collectSessionIDs = (node: SessionNode): string[] => {
                const ids: string[] = [node.sessionID];
                for (const child of node.children) {
                  ids.push(...collectSessionIDs(child));
                }
                return ids;
              };

              sessionTree = await listSessionTree(sessionID, input.client);
              assistantMessages = flattenAssistantMessages(sessionTree);

              // For initiator attribution across children, gather user messages from child sessions.
              // Also gather assistant parts for Tool × Command attribution.
              const childSessionIDs = collectSessionIDs(sessionTree).filter((id) => id !== sessionID);
              const allUserMessages: UserMessage[] = [...userMessages];
              for (const childID of childSessionIDs) {
                try {
                  const childResponse = await input.client.session.messages({
                    path: { id: childID },
                  });

                  if (childResponse.error || !childResponse.data) {
                    continue;
                  }

                  const childUsers: UserMessage[] = childResponse.data
                    .filter((msg) => msg.info.role === "user")
                    .map((msg) => msg.info as UserMessage);
                  allUserMessages.push(...childUsers);

                  const childAssistantParts = childResponse.data
                    .filter((msg) => msg.info.role === "assistant")
                    .flatMap((msg) => msg.parts || []);
                  allParts.push(...childAssistantParts);
                } catch {
                  // Best-effort: missing child session data affects initiator/tool attribution only.
                }
              }
              userMessages = allUserMessages;
            }

            // Antigravity auto-degrade: detect if ANY assistant message uses antigravity
            const isAntigravity = assistantMessages.some(
              (msg) =>
                msg.modelID?.startsWith("antigravity-") ||
                `${msg.providerID}/${msg.modelID}`.startsWith("google/antigravity-")
            );

            // Effective compact mode: user-specified OR auto-degraded for antigravity
            const effectiveCompact = args.compact || isAntigravity;

            if (assistantMessages.length === 0) {
              return "# Token Usage Statistics\n\nNo assistant messages found in this session.";
            }

            const totalStats = aggregateTokens(assistantMessages);
            const statsByModel = aggregateTokensByModel(assistantMessages);

            const customPricing = loadPricingConfig();
            const costResult = calculateCost(statsByModel, customPricing);

            const models = Object.keys(statsByModel);

            let output = "";
            output += renderHeader(sessionID, models, isAntigravity, args.compact === true);
            output += renderTotals(totalStats);
            output += renderEstimatedCost(costResult.totalCost);
            output += renderModelTable(statsByModel, costResult.byModel);
            output += renderWarnings(costResult.warnings);

            // Parse agent args with defaults
            const agentView = (args.agent_view === "execution" || args.agent_view === "initiator") ? args.agent_view : "both";
            const agentSort: "cost" | "tokens" = args.agent_sort === "tokens" ? "tokens" : "cost";
            const agentTopN = args.agent_top_n !== undefined ? args.agent_top_n : 10;

            const statsByAgent = aggregateTokensByAgent(assistantMessages);
            const statsByInitiator = aggregateTokensByInitiator(assistantMessages, userMessages);
            const executionCostMap = computeAgentCosts(assistantMessages, customPricing);
            const initiatorCostMap = computeInitiatorCosts(assistantMessages, userMessages, customPricing);

            // Build and render an agent table from precomputed data
            const appendAgentTable = (
              title: string,
              stats: typeof statsByAgent,
              costMap: Record<string, number>
            ) => {
              if (agentTopN === 0) {
                const entries = Object.entries(stats);
                const { rows: limited, truncated, totalCount } = limitTableRows(entries);
                const rows = limited.map(([agent, rowStats]) => ({
                  agent,
                  stats: rowStats,
                  cost: costMap[agent] || 0,
                }));

                output += renderAgentTable(title, { rows }, costResult.totalCost);

                if (truncated) {
                  output += `\n_...and ${totalCount - limited.length} more rows. Use \`token_export\` for full data._\n`;
                }
              } else {
                // Use topNAgents for sorting + Top-N + Others
                const effectiveN = agentTopN < 0 ? 0 : agentTopN; // negative = unlimited (pass 0 to topNAgents which means all)
                const rows = topNAgents(stats, costMap, effectiveN, agentSort);
                output += renderAgentTable(title, rows, costResult.totalCost);
              }
            };

            // Render based on agent_view
            if (agentView === "both" || agentView === "execution") {
              appendAgentTable("By Execution Agent", statsByAgent, executionCostMap);
            }
            if (agentView === "both" || agentView === "initiator") {
              appendAgentTable("By Initiator Agent", statsByInitiator, initiatorCostMap);
            }

            if (!effectiveCompact) {
              const statsByAgentModel = aggregateTokensByAgentModel(assistantMessages);
              for (const entry of Object.values(statsByAgentModel)) {
                const modelCost = calculateCost(
                  {
                    [entry.model]: {
                      input: entry.input,
                      output: entry.output,
                      total: entry.total,
                      reasoning: entry.reasoning,
                      cache: {
                        read: entry.cache.read,
                        write: entry.cache.write,
                      },
                    },
                  },
                  customPricing
                ).totalCost;

                (entry as typeof entry & { cost?: number }).cost = modelCost;
              }

              output += renderAgentModelTable(statsByAgentModel, costResult.totalCost);

              const toolAttribution = aggregateToolAttribution(allParts);
              if (Object.keys(toolAttribution.byTool).length > 0) {
                output += renderToolCommandTable(toolAttribution, costResult.totalCost);
              }
            }

            const sections: string[] = [];

            try {
              const quotaStatuses = loadAntigravityQuota();
              if (quotaStatuses.length > 0) {
                let quotaSection = `\n## Quota Status\n\n`;
                for (const quota of quotaStatuses) {
                  const icon = quota.severity === "error" ? "🚨" : quota.severity === "warning" ? "⚠️" : "ℹ️";
                  const percent = Math.round(quota.remainingFraction * 100);
                  quotaSection += `- ${icon} ${quota.source}/${quota.scope}: ${percent}% remaining`;
                  if (quota.resetsAt) {
                    quotaSection += ` (resets: ${quota.resetsAt})`;
                  }
                  quotaSection += `\n`;
                }
                output += quotaSection;
                sections.push(quotaSection);
              }
            } catch {

              output += "\n_[Quota status unavailable]_\n";

            }


            if (!effectiveCompact) {
              try {
                const now = new Date();
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const records = await loadHistoryForRange(
                  sevenDaysAgo,
                  now,
                  undefined,
                  scope === "project" ? input.project?.id : undefined
                );
                
                const budgetConfig = loadBudgetConfig();
                const budgetStatuses = getBudgetStatus(records, budgetConfig);
                
                if (budgetStatuses.length > 0) {
                  const budgetSection = `\n## Budget Status\n\n` + formatBudgetSection(budgetStatuses) + `\n`;
                  output += budgetSection;
                  sections.push(budgetSection);
                }
              } catch {
                output += "\n_[Budget status unavailable]_\n";
              }

              try {
                const trendDays = args.trend_days ?? 7;
                const now = new Date();
                const startDate = new Date(now.getTime() - trendDays * 24 * 60 * 60 * 1000);
                const records = await loadHistoryForRange(
                  startDate,
                  now,
                  undefined,
                  scope === "project" ? input.project?.id : undefined
                );
                
                if (records.length > 0) {
                  const trends = analyzeTrends(records);
                  if (trends.buckets.length > 0) {
                    let trendSection = `\n## Trend Analysis (${trendDays} days)\n\n`;
                    
                    const costValues = trends.buckets.map(b => b.cost);
                    const dateLabels = trends.buckets.map(b => b.date.substring(5));
                    const chart = renderBarChart(costValues, dateLabels);
                    if (chart) {
                      trendSection += `### Daily Cost Trend\n\`\`\`\n${chart}\n\`\`\`\n\n`;
                    }

                    trendSection += `| Date | Cost | Tokens | Sessions |\n`;
                    trendSection += `|------|------|--------|----------|\n`;
                    const { rows: limitedBuckets, truncated: bucketsTruncated, totalCount: bucketsTotal } = limitTableRows(trends.buckets);
                    for (const bucket of limitedBuckets) {
                      trendSection += `| ${bucket.date} | $${bucket.cost.toFixed(4)} | ${bucket.tokens.toLocaleString()} | ${bucket.sessions} |\n`;
                    }
                    if (bucketsTruncated) {
                      trendSection += `\n_...and ${bucketsTotal - limitedBuckets.length} more rows. Use \`token_export\` for full data._\n`;
                    }

                    if (trends.weekOverWeekDelta !== 0) {
                      const direction = trends.weekOverWeekDelta > 0 ? "increased" : "decreased";
                      const percentage = Math.abs(trends.weekOverWeekDelta * 100).toFixed(1);
                      trendSection += `\n**Week-over-week:** ${direction} by ${percentage}%\n`;
                    }

                    if (trends.spikes.length > 0) {
                      trendSection += `**Cost spikes detected:** ${trends.spikes.join(", ")}\n`;
                    }

                    output += trendSection;
                    sections.push(trendSection);
                  }
                }
              } catch {
                output += "\n_[Trend analysis unavailable]_\n";
              }

              try {
                const suggestions = generateOptimizationSuggestions(totalStats, statsByModel, customPricing);
                if (suggestions.length > 0) {
                  const optimizationSection = formatOptimizationSection(suggestions);
                  if (optimizationSection) {
                    output += `\n${optimizationSection}\n`;
                    sections.push(optimizationSection);
                  }
                }
              } catch {
                output += "\n_[Optimization suggestions unavailable]_\n";
              }
            }

            // Child session details: totals/cost already include children when include_children=true.
            // Keep compact output small while still surfacing child summary.
            if (args.include_children) {
              try {
                const tree = sessionTree ?? (await listSessionTree(sessionID, input.client));
                if (tree.children.length > 0) {
                  const treeStats = aggregateSessionTree(tree, customPricing);
                  const childTotalTokens = treeStats.childSummaries.reduce(
                    (sum, c) => sum + c.tokens.total,
                    0
                  );
                  const childTotalCost = treeStats.childSummaries.reduce(
                    (sum, c) => sum + c.cost,
                    0
                  );

                  let childSection = `\n## Child Sessions\n\n`;
                  if (effectiveCompact) {
                    childSection += `- Sessions: ${treeStats.childSummaries.length}\n`;
                    childSection += `- Tokens: ${childTotalTokens.toLocaleString()}\n`;
                    childSection += `- Cost: $${childTotalCost.toFixed(4)}\n`;
                  } else {
                    childSection += `| Session ID | Tokens | Cost |\n`;
                    childSection += `|------------|--------|------|\n`;
                    const { rows: limitedChildren, truncated: childrenTruncated, totalCount: childrenTotal } =
                      limitTableRows(treeStats.childSummaries);
                    for (const child of limitedChildren) {
                      const sessionIDShort = child.sessionID.substring(0, 12);
                      childSection += `| ${sessionIDShort}... | ${child.tokens.total.toLocaleString()} | $${child.cost.toFixed(4)} |\n`;
                    }
                    if (childrenTruncated) {
                      childSection += `\n_...and ${childrenTotal - limitedChildren.length} more rows. Use \`token_export\` for full data._\n`;
                    }
                  }

                  output += childSection;
                  sections.push(childSection);
                }
              } catch {
                output += "\n_[Child sessions unavailable]_\n";
              }
            }

            if (args.debug) {
              const debugSection = `\n## Debug Info\n\n${getDebugInfo(sections)}\n`;
              output += debugSection;
            }

            // Antigravity auto-degrade: stricter output cap (8000 chars vs default 20000)
            const stabilityConfig = isAntigravity ? { maxChars: 8000 } : {};
            const result = truncateOutput(output, stabilityConfig);
            return result.content;
          } catch (error) {
            return `Error calculating token statistics: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
    },
    event: async ({ event }: any) => {
      if (event.type === "message.updated") {
        try {
          const msgInfo = event.properties?.info;
          if (!msgInfo || msgInfo.role !== "assistant") {
            return;
          }

          const sessionID = msgInfo.sessionID;
          
          if (inFlightSessions.has(sessionID)) {
            return;
          }
          inFlightSessions.add(sessionID);
          
          try {
            const response = await input.client.session.messages({
              path: { id: sessionID },
            });

            if (response.error || !response.data) {
              return;
            }

            const messages = response.data;
            const assistantMessages: AssistantMessage[] = messages
              .filter((m) => m.info.role === "assistant")
              .map((m) => m.info as AssistantMessage);

            if (assistantMessages.length === 0) {
              return;
            }

            const byModel = aggregateTokensByModel(assistantMessages);
            const customPricing = loadPricingConfig();
            const costResult = calculateCost(byModel, customPricing);
            const quotaStatuses = loadAntigravityQuota();

            const decision = shouldShowToast(costResult.totalCost, quotaStatuses, sessionID);

            if (decision.show && decision.message) {
              updateState(sessionID, costResult.totalCost, quotaStatuses);

              await input.client.tui.showToast({
                body: {
                  message: decision.message,
                  variant: decision.message.includes("⚠️") ? "warning" : "info",
                  duration: 5000,
                },
              });
            }
          } finally {
            inFlightSessions.delete(sessionID);
          }
        } catch (error) {
          console.error("Error in message.updated handler:", error);
        }

        return;
      }

      if (event.type === "session.idle") {
        try {
          const sessionID = event.properties.sessionID;
          const response = await input.client.session.messages({
            path: { id: sessionID },
          });

          if (response.error) {
            return;
          }

          const messages = response.data || [];
          const assistantMessages: AssistantMessage[] = messages
            .filter((msg) => msg.info.role === "assistant")
            .map((msg) => msg.info as AssistantMessage);

          if (assistantMessages.length === 0) {
            return;
          }

          const totals = aggregateTokens(assistantMessages);
          const byModel = aggregateTokensByModel(assistantMessages);
          const customPricing = loadPricingConfig();
          const costResult = calculateCost(byModel, customPricing);

          let aggregateCost = costResult.totalCost;
          try {
            const tree = await listSessionTree(sessionID, input.client, { maxDepth: 3 });
            if (tree.children.length > 0) {
              const treeStats = aggregateSessionTree(tree, customPricing);
              const treeCostResult = calculateCost(treeStats.byModel, customPricing);
              aggregateCost = treeCostResult.totalCost;
            }
          } catch {
          }

          await saveSessionRecord({
            sessionID,
            projectID: input.project?.id,
            timestamp: Date.now(),
            totals,
            byModel,
            cost: costResult.totalCost,
          });

          await input.client.tui.showToast({
            body: {
              message: `Session Cost: $${aggregateCost.toFixed(4)}`,
              variant: "info",
              duration: 5000,
            },
          });

          resetState(sessionID);
        } catch (error) {
          console.error("Error in session.idle handler:", error);
        }
      }
    },
  };
}
