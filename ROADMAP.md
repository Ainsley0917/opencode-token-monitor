# ROADMAP.md - Technical Planning

> Phase 2+ features for `opencode-token-monitor` plugin.

**Current State**: MVP complete (token_stats tool + configurable pricing)  
**Version**: 0.1.0

---

## Phase 2: History & Alerts (Next)

### 2.1 History Persistence

**Goal**: Track token usage across sessions, enable trend analysis.

#### Data Model

```typescript
// lib/types.ts additions
type SessionRecord = {
  sessionID: string;
  timestamp: number;           // Unix ms
  models: string[];            // ["anthropic/claude-sonnet-4", ...]
  tokens: TokenStats;
  cost: number;
  duration?: number;           // Session duration in seconds
};

type HistoryStore = {
  version: 1;
  records: SessionRecord[];
};
```

#### Storage Strategy

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Single JSON file | Simple, portable | Large file over time | ✅ MVP |
| SQLite | Query performance | Dependency, complexity | Future |
| Per-session files | Easy cleanup | Many files | Rejected |

**Location**: `~/.opencode/token-history.json`

#### New Module: `lib/history.ts`

```typescript
// Core functions
loadHistory(): HistoryStore
saveSession(record: SessionRecord): void
getSessionHistory(limit?: number): SessionRecord[]
getUsageByDateRange(from: Date, to: Date): SessionRecord[]
getTotalSpend(): number
pruneOldRecords(olderThanDays: number): number
```

#### Implementation Steps

1. Define types in `lib/types.ts`
2. Implement `lib/history.ts` with TDD
3. Hook into `token_stats` tool - auto-save after each call
4. Add `token_history` tool for querying

#### New Tool: `token_history`

```typescript
tool({
  description: "Show token usage history across sessions",
  args: {
    days: { type: "number", description: "Days to look back (default: 7)" },
    limit: { type: "number", description: "Max records to show (default: 20)" },
  },
  async execute(args, context) {
    // Return markdown table of historical usage
  },
});
```

#### Tests Required

- Empty history returns empty array
- Save + load roundtrip
- Date range filtering
- Prune removes old records only
- Handles corrupted JSON gracefully

---

### 2.2 Budget Alerts

**Goal**: Warn users when approaching spending limits.

#### Configuration

```json
// ~/.opencode/token-monitor.json
{
  "budget": {
    "daily": 10.00,
    "weekly": 50.00,
    "monthly": 200.00,
    "session": 5.00
  },
  "alerts": {
    "thresholds": [0.5, 0.8, 1.0],  // 50%, 80%, 100%
    "enabled": true
  }
}
```

#### New Module: `lib/budget.ts`

```typescript
type BudgetConfig = {
  daily?: number;
  weekly?: number;
  monthly?: number;
  session?: number;
};

type BudgetStatus = {
  period: "daily" | "weekly" | "monthly" | "session";
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  alerts: string[];  // Triggered alert messages
};

// Functions
loadBudgetConfig(): BudgetConfig
checkBudget(history: SessionRecord[], config: BudgetConfig): BudgetStatus[]
formatBudgetWarnings(statuses: BudgetStatus[]): string
```

#### Integration Points

1. **token_stats output**: Append budget warnings if thresholds exceeded
2. **New tool**: `token_budget` for dedicated budget view
3. **Future**: Hook into session start for proactive warnings

#### Implementation Steps

1. Define config schema + types
2. Implement `lib/budget.ts` with TDD
3. Integrate budget check into `token_stats`
4. Add `token_budget` tool

---

## Phase 3: Real-time TUI

**Goal**: Live token counter during active sessions.

### 3.1 Architecture Options

| Approach | Description | Feasibility |
|----------|-------------|-------------|
| Polling | Query SDK every N seconds | ✅ Simple, works now |
| WebSocket | Real-time SDK events | ❓ Requires SDK support |
| File watch | Monitor session files | ❓ Implementation-dependent |

**Decision**: Start with polling (Phase 3.1), upgrade if SDK adds streaming.

### 3.2 TUI Module: `lib/tui.ts`

```typescript
type TUIOptions = {
  refreshInterval: number;  // ms, default 2000
  compact: boolean;         // Single line vs full display
  showCost: boolean;
  showModels: boolean;
};

class TokenMonitorTUI {
  constructor(client: OpencodeClient, options: TUIOptions);
  start(): void;
  stop(): void;
  render(): string;  // ANSI-formatted output
}
```

### 3.3 Display Format

```
┌─ Token Monitor ─────────────────────────────────┐
│ Session: ses_abc123                             │
│ Model: anthropic/claude-sonnet-4                │
├─────────────────────────────────────────────────┤
│ Input:  12,345 │ Output: 5,678 │ Total: 18,023  │
│ Cache:  8,901r/2,345w │ Reasoning: 0           │
├─────────────────────────────────────────────────┤
│ Cost: $0.1234 │ Budget: $4.87 remaining (51%)   │
└─────────────────────────────────────────────────┘
```

### 3.4 Compact Mode (Single Line)

```
[tokens] 18,023 (in:12,345 out:5,678) | $0.12 | 51% budget
```

### 3.5 Implementation Steps

1. Create `lib/tui.ts` with render logic (no I/O)
2. Add ANSI color/box drawing utilities
3. Implement polling loop with cleanup
4. Add `token_monitor` tool to start/stop TUI
5. Handle terminal resize gracefully

### 3.6 Dependencies

- Requires: Phase 2.1 (history) for trend display
- Requires: Phase 2.2 (budget) for budget remaining

---

## Phase 4: Agent Breakdown

**Goal**: Categorize token usage by agent type (build, explore, oracle, etc.).

### 4.1 Data Model Extension

```typescript
type AgentUsage = {
  agentType: string;  // "build", "explore", "oracle", etc.
  tokens: TokenStats;
  cost: number;
  messageCount: number;
};

type SessionRecordV2 = SessionRecord & {
  byAgent: AgentUsage[];
};
```

### 4.2 Agent Detection

Extract from message metadata:
- `msg.info.mode` field (if available)
- Parent session context
- Tool invocation patterns

### 4.3 New Tool: `token_agents`

```typescript
tool({
  description: "Show token usage breakdown by agent type",
  args: {
    sessionID: { type: "string", optional: true },
  },
  async execute(args, context) {
    // Return per-agent breakdown table
  },
});
```

---

## Phase 5: Notifications

**Goal**: Proactive alerts via system notifications.

### 5.1 Notification Triggers

- Budget threshold crossed
- Session cost exceeds limit
- Unusual usage spike detected

### 5.2 Implementation Options

| Platform | Method | Library |
|----------|--------|---------|
| macOS | `osascript` | Native |
| Linux | `notify-send` | libnotify |
| Cross-platform | `node-notifier` | npm package |

**Decision**: Use native commands first (zero deps), add library later if needed.

### 5.3 Module: `lib/notifications.ts`

```typescript
type NotificationOptions = {
  title: string;
  message: string;
  urgency: "low" | "normal" | "critical";
};

async function notify(options: NotificationOptions): Promise<boolean>;
function detectPlatform(): "macos" | "linux" | "windows" | "unknown";
```

---

## Phase 6: NPM Publishing

**Goal**: Distribute as installable package.

### 6.1 Package Preparation

```json
{
  "name": "@opencode/token-monitor",
  "version": "1.0.0",
  "main": "dist/plugin.js",
  "types": "dist/types.d.ts",
  "files": ["dist/", "pricing.json"],
  "keywords": ["opencode", "plugin", "tokens", "cost"],
  "repository": "github:user/opencode-token-monitor"
}
```

### 6.2 Pre-publish Checklist

- [ ] All tests passing
- [ ] Type declarations generated
- [ ] README with installation instructions
- [ ] CHANGELOG.md maintained
- [ ] LICENSE file added
- [ ] .npmignore configured

### 6.3 Installation Command (Target)

```bash
opencode plugin install @opencode/token-monitor
```

---

## Dependency Graph

```
Phase 2.1 (History)
    │
    ├──► Phase 2.2 (Budget) ──► Phase 5 (Notifications)
    │
    └──► Phase 3 (TUI)
              │
              └──► Phase 4 (Agent Breakdown)
                        │
                        └──► Phase 6 (NPM Publish)
```

---

## Priority Matrix

| Phase | Feature | Effort | Impact | Priority |
|-------|---------|--------|--------|----------|
| 2.1 | History persistence | Medium | High | 🔴 P0 |
| 2.2 | Budget alerts | Medium | High | 🔴 P0 |
| 3 | Real-time TUI | High | Medium | 🟡 P1 |
| 4 | Agent breakdown | Medium | Medium | 🟡 P1 |
| 5 | Notifications | Low | Medium | 🟢 P2 |
| 6 | NPM publish | Low | Low | 🟢 P2 |

---

## Next Action

Start Phase 2.1 (History Persistence):
1. Add `SessionRecord` and `HistoryStore` types
2. Create `lib/history.ts` with TDD
3. Integrate auto-save into `token_stats`
4. Add `token_history` tool
