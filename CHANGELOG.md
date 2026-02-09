# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-02-09

### Added
- Tool usage chart (Top tools by call count, with percentages).
- Cache hit rate metric in totals.
- Cache hit rate trend sparklines (overall + per-provider) in trend analysis.

### Changed
- Antigravity auto-compact: per-model table is capped to fewer rows to reduce payload size.
- Sparkline rendering supports gaps for missing datapoints.
- Token stats header truncates long model lists to keep output stable.

## [0.4.1] - 2026-02-09

### Fixed
- `token_history` / `token_export` (range): Treat date-only `to` values as inclusive (end-of-day) so `from=to` works as expected.

### Changed
- Documented the `recalculate` option and date-only range behavior in README.

## [0.4.0] - 2026-02-09

### Added
- `recalculate` option for `token_history` and `token_export` (range) to recompute stored session costs using current pricing.

## [0.3.1] - 2026-02-09

### Fixed
- `token_export`: Create parent directories automatically when exporting to nested file paths.

### Changed
- Installation docs updated to recommend `opencode.json` plugin config as primary method.
- Added npm downloads and MIT license badges to README.

## [0.3.0] - 2026-02-08

### Added
- **Project-Aware Analytics**:
  - Automatic session tagging with project IDs.
  - New `scope` parameter for `token_stats` and `token_history` to filter trends and history by project.
  - New `history_scope` parameter for `token_export` to filter range exports by project.
  - Project ID inclusion in JSON, CSV, and Markdown exports.
  - Backward-compatible history loading (legacy records included in global scope, excluded from project-specific scope).

## [0.2.0] - 2026-02-08

### Added
- **Ecosystem Analytics**: 
  - Token and cost attribution by Execution Agent and Initiator Agent.
  - Agent×Model cross-breakdown table.
  - Tool×Command attribution with safe command summaries.
- **History & Trends**:
  - Persistent session history storage.
  - `token_history` tool for querying past usage.
  - Trend analysis with ASCII bar charts for daily costs.
  - Week-over-week change detection and cost spike alerts.
- **Budgeting & Quotas**:
  - Configurable daily, weekly, and monthly budget thresholds via `token-monitor.json`.
  - Antigravity quota monitoring.
  - Session-level and budget-level toast notifications.
- **Enhanced `token_stats`**:
  - `include_children` parameter for recursive session aggregation.
  - `compact` mode for reducing output size.
  - `agent_view`, `agent_sort`, and `agent_top_n` parameters for fine-grained control.
- **Data Export**:
  - `token_export` tool supporting JSON, CSV, and Markdown.
- **Stability**:
  - Automatic output truncation and Antigravity auto-degradation.

### Changed
- Refactored rendering logic into specialized `lib/renderer.ts`.
- Improved model detection and pricing coverage (including Antigravity variants).
- Updated `package.json` for NPM readiness.

## [0.1.0] - 2026-02-01

### Added
- Initial release.
- Basic `token_stats` tool with model breakdown.
- Cost calculation with custom `pricing.json` support.
- Core aggregation logic for input, output, reasoning, and cache tokens.
