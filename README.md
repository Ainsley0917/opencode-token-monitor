# opencode-token-monitor

[![CI](https://github.com/Ainsley0917/opencode-token-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/Ainsley0917/opencode-token-monitor/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/opencode-token-monitor.svg)](https://www.npmjs.com/package/opencode-token-monitor)
[![npm downloads](https://img.shields.io/npm/dw/opencode-token-monitor.svg)](https://www.npmjs.com/package/opencode-token-monitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Ainsley0917/opencode-token-monitor/blob/main/LICENSE)

OpenCode plugin for monitoring token usage, estimating costs, and tracking ecosystem analytics across AI coding sessions.

## Features

- **Real-time Monitoring**: Track token usage (input/output/reasoning/cache) for all assistant messages.
- **Ecosystem Analytics**: 
  - **Agent Breakdown**: Detailed cost and token attribution by execution agent and initiator agent.
  - **Agent×Model Cross-breakdown**: See which agents are using which models.
  - **Tool×Command Attribution**: Identify high-cost tools and commands (safe summaries only).
- **History & Trends**:
  - **Persistent History**: Automatically saves session records for long-term tracking.
  - **Trend Analysis**: Daily cost trends, Week-over-week changes, and cost spike detection.
  - **Visual Charts**: ASCII bar charts for cost trends directly in the terminal.
- **Budgeting & Quotas**:
  - **Budget Thresholds**: Set daily, weekly, and monthly budget limits.
  - **Quota Integration**: Monitor Antigravity quota remaining fractions.
  - **Live Notifications**: Toast notifications for session costs and budget warnings.
- **Advanced Export**: Export data to JSON, CSV, or Markdown formats for external analysis.
- **Stability Features**: Automatic output truncation and "compact mode" for heavy sessions or Antigravity models.

## Installation

### 1. Recommended: Using opencode.json

Add the plugin to your `opencode.json` configuration file. OpenCode will automatically download and load the plugin on startup.

Add `"opencode-token-monitor@latest"` to the `plugin` array:

```json
{
  "plugin": [
    "opencode-token-monitor@latest"
  ]
}
```

The `opencode.json` file can be located at:
- `~/.config/opencode/opencode.json` (Global configuration)
- Project root directory (Project-level configuration)

Restart OpenCode after making this change.

### 2. Via npm

```bash
npm install -g opencode-token-monitor
```

Then copy the plugin to your OpenCode plugins directory:

```bash
cp $(npm root -g)/opencode-token-monitor/dist/plugin.js ~/.opencode/plugins/token-monitor.js
```

### 3. From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/Ainsley0917/opencode-token-monitor.git
   cd opencode-token-monitor
   ```
2. Install dependencies and build:
   ```bash
   bun install
   bun run build
   ```
3. Copy the plugin to your OpenCode plugins directory:
   ```bash
   cp dist/plugin.js ~/.opencode/plugins/token-monitor.js
   ```

## Usage

The plugin registers three tools: `token_stats`, `token_history`, and `token_export`.

### `token_stats`

Show detailed token usage for the current or specified session.

**Parameters:**
- `session_id` (string, optional): Session ID to inspect. Defaults to current.
- `include_children` (boolean, optional): Include child sessions in aggregation.
- `agent_view` (string, optional): "execution", "initiator", or "both" (default).
- `agent_sort` (string, optional): Sort tables by "cost" (default) or "tokens".
- `agent_top_n` (number, optional): Show top N agents (default: 10). Use 0 to show all.
- `trend_days` (number, optional): Number of days for trend analysis (default: 7).
- `scope` (string, optional): Filter historical trends to "project" or "all" (default).
- `compact` (boolean, optional): Skip heavy tables (auto-enabled for Antigravity models).
- `debug` (boolean, optional): Include debug information.

### `token_history`

Query historical token usage over a date range.

**Parameters:**
- `from` (string, optional): Start date (ISO format, e.g., "2026-01-01").
- `to` (string, optional): End date (ISO format, e.g., "2026-02-07").
- `scope` (string, optional): Filter history to "project" or "all" (default).

### `token_export`

Export token data for external use.

**Parameters:**
- `format` (string, required): "json", "csv", or "markdown".
- `scope` (string, optional): "session" (default) or "range".
- `session_id` (string, optional): For session scope.
- `from`/`to` (string, optional): For range scope.
- `history_scope` (string, optional): Filter range data to "project" or "all" (default).
- `file_path` (string, optional): Save to a specific file.

## Project-Aware Analytics

The plugin automatically tracks usage on a per-project basis using the project ID provided by OpenCode.

- **Automatic Tagging**: Every session record is tagged with the current project ID.
- **Scope Selection**: Use `scope: "project"` (in `token_stats`/`token_history`) or `history_scope: "project"` (in `token_export`) to filter analytics to the current project.
- **Backward Compatibility**: History recorded before this feature was added is preserved. These "legacy" records are included when using `scope: "all"` (default) but are excluded when filtering by a specific project.
- **No Manual Migration**: The system handles mixed history gracefully without requiring any manual data updates.

## Configuration

### Pricing (`pricing.json`)

Customize pricing in `pricing.json` (searched in current dir, `~/.opencode/`, or `~/.config/opencode/`):

```json
{
  "anthropic/claude-sonnet-4": {
    "input_per_million": 3.0,
    "output_per_million": 15.0,
    "cache_read_per_million": 0.30,
    "cache_write_per_million": 3.75
  }
}
```

### Budgets (`token-monitor.json`)

Set budget limits in `token-monitor.json`:

```json
{
  "budget": {
    "daily": 5.00,
    "weekly": 25.00,
    "monthly": 100.00
  }
}
```

## Development

```bash
bun test              # Run 340+ tests
bun run typecheck     # Verify types
bun run build         # Bundle plugin
```

Created by [@Ainsley0917](https://github.com/Ainsley0917)

## License

MIT
