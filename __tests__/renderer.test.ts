import { describe, expect, test } from "bun:test";
import {
  renderAgentTable,
  renderAgentModelTable,
  renderEstimatedCost,
  renderHeader,
  renderModelTable,
  renderToolCommandTable,
  renderToolUsageChart,
  renderTotals,
  renderWarnings,
} from "../lib/renderer";
import type {
  TokenStatsByAgentModel,
  TokenStatsByModel,
  ToolAttributionResult,
} from "../lib/types";

describe("renderer", () => {
  test("renderHeader: basic output", () => {
    const result = renderHeader(
      "ses_123",
      ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
      false,
      false
    );

    expect(result).toBe(
      "# Token Usage Statistics\n\n**Session:** ses_123\n**Models:** anthropic/claude-sonnet-4, openai/gpt-4o\n\n"
    );
  });

  test("renderHeader: includes antigravity indicator", () => {
    const result = renderHeader("ses_123", ["google/antigravity-test"], true, false);

    expect(result).toContain("_ℹ️ Compact mode auto-applied for Antigravity provider._");
  });

  test("renderHeader: omits antigravity indicator when compact is explicit", () => {
    const result = renderHeader("ses_123", ["google/antigravity-test"], true, true);

    expect(result).not.toContain("_ℹ️ Compact mode auto-applied for Antigravity provider._");
  });

  test("renderTotals: formats numbers with commas", () => {
    const result = renderTotals({
      input: 1234567,
      output: 7654321,
      total: 8888888,
      reasoning: 2222222,
      cache: { read: 1000000, write: 2000000 },
    });

    expect(result).toContain("- Input: 1,234,567 tokens");
    expect(result).toContain("- Output: 7,654,321 tokens");
    expect(result).toContain("- Total: 8,888,888 tokens");
    expect(result).toContain("- Reasoning: 2,222,222 tokens");
    expect(result).toContain("- Cache (read/write): 1,000,000/2,000,000 tokens");
    expect(result).toContain("- Cache hit rate: 44.8%");
  });

  test("renderTotals: shows cache hit rate N/A when denominator is zero", () => {
    const result = renderTotals({
      input: 0,
      output: 10,
      total: 10,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    });

    expect(result).toContain("- Cache hit rate: N/A");
  });

  test("renderEstimatedCost: formats currency", () => {
    const result = renderEstimatedCost(0.012345);

    expect(result).toBe("## Estimated Cost\n- Total: $0.0123\n\n");
  });

  test("renderModelTable: renders single model row", () => {
    const statsByModel: TokenStatsByModel = {
      "anthropic/claude-sonnet-4": {
        input: 100,
        output: 200,
        total: 300,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const result = renderModelTable(statsByModel, {
      "anthropic/claude-sonnet-4": 0.0123,
    });

    expect(result).toContain("## Per-Model Breakdown");
    expect(result).toContain("| Model | Input | Output | Total | Cost |");
    expect(result).toContain("| anthropic/claude-sonnet-4 | 100 | 200 | 300 | $0.0123 |");
  });

  test("renderModelTable: renders multiple model rows", () => {
    const statsByModel: TokenStatsByModel = {
      "anthropic/claude-sonnet-4": {
        input: 100,
        output: 200,
        total: 300,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      "openai/gpt-4o": {
        input: 50,
        output: 150,
        total: 200,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const result = renderModelTable(statsByModel, {
      "anthropic/claude-sonnet-4": 0.0123,
      "openai/gpt-4o": 0.0045,
    });

    expect(result).toContain("| anthropic/claude-sonnet-4 | 100 | 200 | 300 | $0.0123 |");
    expect(result).toContain("| openai/gpt-4o | 50 | 150 | 200 | $0.0045 |");
  });

  test("renderModelTable: truncates rows using limitTableRows", () => {
    const statsByModel: TokenStatsByModel = {};
    const costByModel: Record<string, number> = {};

    for (let i = 0; i < 55; i++) {
      const model = `test/model-${i}`;
      statsByModel[model] = {
        input: 1,
        output: 2,
        total: 3,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      };
      costByModel[model] = 0.0001;
    }

    const result = renderModelTable(statsByModel, costByModel);
    const rowMatches = result.match(/\| test\/model-\d+ \|/g) ?? [];

    expect(rowMatches).toHaveLength(50);
    expect(result).toContain("_...and 5 more rows. Use `token_export` for full data._");
  });

  test("renderAgentTable: includes Others row", () => {
    const result = renderAgentTable(
      "By Execution Agent",
      {
        rows: [
          {
            agent: "build",
            stats: {
              input: 100,
              output: 200,
              total: 300,
              reasoning: 0,
              cache: { read: 0, write: 0 },
              messageCount: 2,
            },
            cost: 0.06,
          },
        ],
        others: {
          agent: "Others",
          stats: {
            input: 50,
            output: 50,
            total: 100,
            reasoning: 0,
            cache: { read: 0, write: 0 },
            messageCount: 3,
          },
          cost: 0.04,
          count: 2,
        },
      },
      0.1
    );

    expect(result).toContain("\n## By Execution Agent\n");
    expect(result).toContain("| Agent | Input | Output | Total | Msgs | Cost | %Cost |");
    expect(result).toContain("| build | 100 | 200 | 300 | 2 | $0.0600 | 60.0% |");
    expect(result).toContain("| Others (2) | 50 | 50 | 100 | 3 | $0.0400 | 40.0% |");
  });

  test("renderAgentTable: without Others row", () => {
    const result = renderAgentTable(
      "By Initiator Agent",
      {
        rows: [
          {
            agent: "oracle",
            stats: {
              input: 10,
              output: 20,
              total: 30,
              reasoning: 0,
              cache: { read: 0, write: 0 },
              messageCount: 1,
            },
            cost: 0,
          },
        ],
      },
      0
    );

    expect(result).toContain("| oracle | 10 | 20 | 30 | 1 | $0.0000 | - |");
    expect(result).not.toContain("Others (");
  });

  test("renderAgentTable: empty rows", () => {
    const result = renderAgentTable("By Execution Agent", { rows: [] }, 1);

    expect(result).toContain("\n## By Execution Agent\n");
    expect(result).toContain("| Agent | Input | Output | Total | Msgs | Cost | %Cost |");
    expect(result).not.toContain("| unknown |");
  });

  test("renderAgentModelTable: empty data renders minimal section", () => {
    const result = renderAgentModelTable({}, 1);

    expect(result).toContain("## Agent × Model");
    expect(result).toContain("| Agent | Model | Msgs | Input | Output | Total | Cost | %Cost |");
  });

  test("renderAgentModelTable: renders single agent-model row", () => {
    const statsByAgentModel: TokenStatsByAgentModel = {
      "build|anthropic/claude-sonnet-4": {
        agent: "build",
        model: "anthropic/claude-sonnet-4",
        input: 100,
        output: 200,
        total: 300,
        reasoning: 0,
        cache: { read: 0, write: 0 },
        messageCount: 2,
      },
    };
    (statsByAgentModel["build|anthropic/claude-sonnet-4"] as TokenStatsByAgentModel[string] & {
      cost: number;
    }).cost = 0.03;

    const result = renderAgentModelTable(statsByAgentModel, 0.06);

    expect(result).toContain("| build | anthropic/claude-sonnet-4 | 2 | 100 | 200 | 300 | $0.0300 | 50.0% |");
  });

  test("renderAgentModelTable: sorts rows by cost descending", () => {
    const statsByAgentModel: TokenStatsByAgentModel = {
      "oracle|anthropic/claude-sonnet-4": {
        agent: "oracle",
        model: "anthropic/claude-sonnet-4",
        input: 10,
        output: 10,
        total: 20,
        reasoning: 0,
        cache: { read: 0, write: 0 },
        messageCount: 1,
      },
      "build|anthropic/claude-sonnet-4": {
        agent: "build",
        model: "anthropic/claude-sonnet-4",
        input: 20,
        output: 20,
        total: 40,
        reasoning: 0,
        cache: { read: 0, write: 0 },
        messageCount: 1,
      },
    };
    (statsByAgentModel["oracle|anthropic/claude-sonnet-4"] as TokenStatsByAgentModel[string] & {
      cost: number;
    }).cost = 0.01;
    (statsByAgentModel["build|anthropic/claude-sonnet-4"] as TokenStatsByAgentModel[string] & {
      cost: number;
    }).cost = 0.02;

    const result = renderAgentModelTable(statsByAgentModel, 0.03);
    const buildIdx = result.indexOf("| build | anthropic/claude-sonnet-4");
    const oracleIdx = result.indexOf("| oracle | anthropic/claude-sonnet-4");

    expect(buildIdx).toBeGreaterThan(-1);
    expect(oracleIdx).toBeGreaterThan(-1);
    expect(buildIdx).toBeLessThan(oracleIdx);
  });

  test("renderAgentModelTable: truncates rows using limitTableRows", () => {
    const statsByAgentModel: TokenStatsByAgentModel = {};

    for (let i = 0; i < 55; i++) {
      const key = `agent-${i}|test/model-${i}`;
      statsByAgentModel[key] = {
        agent: `agent-${i}`,
        model: `test/model-${i}`,
        input: 1,
        output: 1,
        total: 2,
        reasoning: 0,
        cache: { read: 0, write: 0 },
        messageCount: 1,
      };
      (statsByAgentModel[key] as TokenStatsByAgentModel[string] & { cost: number }).cost =
        0.0001 + i * 0.000001;
    }

    const result = renderAgentModelTable(statsByAgentModel, 1);
    const rowMatches = result.match(/\| agent-\d+ \| test\/model-\d+ \|/g) ?? [];

    expect(rowMatches).toHaveLength(50);
    expect(result).toContain("_...and 5 more rows. Use `token_export` for full data._");
  });

  test("renderAgentModelTable: shows %Cost for each row", () => {
    const statsByAgentModel: TokenStatsByAgentModel = {
      "build|openai/gpt-4o": {
        agent: "build",
        model: "openai/gpt-4o",
        input: 100,
        output: 100,
        total: 200,
        reasoning: 0,
        cache: { read: 0, write: 0 },
        messageCount: 1,
      },
    };
    (statsByAgentModel["build|openai/gpt-4o"] as TokenStatsByAgentModel[string] & { cost: number }).cost =
      0.025;

    const result = renderAgentModelTable(statsByAgentModel, 0.05);
    expect(result).toContain("| build | openai/gpt-4o | 1 | 100 | 100 | 200 | $0.0250 | 50.0% |");
  });

  test("renderToolCommandTable: empty byTool returns empty string", () => {
    const attribution: ToolAttributionResult = { byTool: {} };

    expect(renderToolCommandTable(attribution, 1)).toBe("");
  });

  test("renderToolCommandTable: renders single tool with title", () => {
    const attribution: ToolAttributionResult = {
      byTool: {
        bash: {
          tool: "bash",
          title: "Run bun test",
          callCount: 2,
          tokens: {
            input: 120,
            output: 80,
            total: 200,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0.04,
        },
      },
    };

    const result = renderToolCommandTable(attribution, 0.1);

    expect(result).toContain("## Tool × Command");
    expect(result).toContain("| Tool | Summary | Calls | Input | Output | Total | Cost | %Cost |");
    expect(result).toContain("| bash | Run bun test | 2 | 120 | 80 | 200 | $0.0400 | 40.0% |");
  });

  test("renderToolCommandTable: sorts rows by cost descending", () => {
    const attribution: ToolAttributionResult = {
      byTool: {
        low: {
          tool: "low",
          title: "Low cost",
          callCount: 1,
          tokens: {
            input: 10,
            output: 5,
            total: 15,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0.01,
        },
        high: {
          tool: "high",
          title: "High cost",
          callCount: 1,
          tokens: {
            input: 30,
            output: 20,
            total: 50,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0.05,
        },
      },
    };

    const result = renderToolCommandTable(attribution, 0.1);
    const highIdx = result.indexOf("| high | High cost | 1 | 30 | 20 | 50 | $0.0500 | 50.0% |");
    const lowIdx = result.indexOf("| low | Low cost | 1 | 10 | 5 | 15 | $0.0100 | 10.0% |");

    expect(highIdx).toBeGreaterThan(-1);
    expect(lowIdx).toBeGreaterThan(-1);
    expect(highIdx).toBeLessThan(lowIdx);
  });

  test("renderToolCommandTable: keeps pre-truncated 60-char title", () => {
    const title60 = "123456789012345678901234567890123456789012345678901234567890";
    const attribution: ToolAttributionResult = {
      byTool: {
        tool: {
          tool: "tool",
          title: title60,
          callCount: 1,
          tokens: {
            input: 1,
            output: 2,
            total: 3,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0.001,
        },
      },
    };

    const result = renderToolCommandTable(attribution, 1);

    expect(title60).toHaveLength(60);
    expect(result).toContain(`| tool | ${title60} | 1 | 1 | 2 | 3 | $0.0010 | 0.1% |`);
  });

  test("renderToolCommandTable: shows dash %Cost when totalCost is zero", () => {
    const attribution: ToolAttributionResult = {
      byTool: {
        bash: {
          tool: "bash",
          title: "No cost",
          callCount: 1,
          tokens: {
            input: 10,
            output: 10,
            total: 20,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0,
        },
      },
    };

    const result = renderToolCommandTable(attribution, 0);

    expect(result).toContain("| bash | No cost | 1 | 10 | 10 | 20 | $0.0000 | - |");
  });

  test("renderToolUsageChart: empty byTool returns empty string", () => {
    const attribution: ToolAttributionResult = { byTool: {} };

    expect(renderToolUsageChart(attribution)).toBe("");
  });

  test("renderToolUsageChart: renders sorted bars with percentages", () => {
    const attribution: ToolAttributionResult = {
      byTool: {
        bash: {
          tool: "bash",
          title: "Run bash",
          callCount: 2,
          tokens: {
            input: 10,
            output: 10,
            total: 20,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0,
        },
        read: {
          tool: "read",
          title: "Read files",
          callCount: 8,
          tokens: {
            input: 10,
            output: 10,
            total: 20,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0,
        },
      },
    };

    const result = renderToolUsageChart(attribution);
    const readIdx = result.indexOf("read");
    const bashIdx = result.indexOf("bash");

    expect(result).toContain("## Tool Usage");
    expect(readIdx).toBeGreaterThan(-1);
    expect(bashIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeLessThan(bashIdx);
    expect(result).toContain("8 (80.0%)");
    expect(result).toContain("2 (20.0%)");
    expect(result).toContain("████████████████████");
  });

  test("renderToolUsageChart: truncates to top 20 tools", () => {
    const byTool: ToolAttributionResult["byTool"] = {};
    for (let i = 0; i < 25; i++) {
      byTool[`tool-${i}`] = {
        tool: `tool-${i}`,
        title: `Tool ${i}`,
        callCount: 25 - i,
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        cost: 0,
      };
    }

    const result = renderToolUsageChart({ byTool });
    const lines = result.split("\n").filter((line) => line.startsWith("tool-"));

    expect(lines).toHaveLength(20);
    expect(result).toContain("_...and 5 more tools._");
  });

  test("renderWarnings: empty array returns empty string", () => {
    expect(renderWarnings([])).toBe("");
  });

  test("renderWarnings: renders multiple warnings", () => {
    const result = renderWarnings(["Unknown model: foo/bar", "Unknown model: baz/qux"]);

    expect(result).toBe(
      "\n## Warnings\n- Unknown model: foo/bar\n- Unknown model: baz/qux\n"
    );
  });
});
