# Token Monitor Plugin: Operational Runbook

## Reload Flow

When plugin code changes, you MUST follow this exact sequence:

1. **Build**: `bun run build`
   - Produces: `dist/plugin.js`
   - Verify: file exists and timestamp is fresh

2. **Install**: `cp dist/plugin.js ~/.opencode/plugins/token-monitor.js`
   - This copies the bundled plugin to OpenCode's plugin directory

3. **Restart**: Restart OpenCode / start new session
   - Code changes are NOT hot-reloaded
   - The plugin is loaded once at startup

### Quick One-Liner
```bash
bun run build && cp dist/plugin.js ~/.opencode/plugins/token-monitor.js
```

## Antigravity 400 Triage

### Symptoms
- Tool calls fail with `400 INVALID_ARGUMENT` on `google/antigravity-*` models
- May occur mid-session as context/payload grows

### Immediate Actions
1. Start a new OpenCode session (reduces accumulated context)
2. If plugin was recently modified: rebuild and reinstall (see Reload Flow)
3. Verify all 3 tools have non-empty arg schemas (regression test catches this)

### Root Cause Analysis
- **Payload bloat**: Long sessions accumulate tool output, growing request size
- **Schema metadata**: Tool descriptions contribute to function declaration payload
- **Mitigation applied**: 
  - Schema descriptions slimmed (< 600 chars total)
  - Antigravity auto-degrade: compact mode + 8000 char output cap auto-applied
  - Table rows capped at 50 with truncation markers
  - In-flight guard prevents concurrent duplicate event processing

### Diagnostic Commands
```bash
bun test             # Verify all tests pass
bun run typecheck    # Verify no type errors
bun run build        # Verify build succeeds
```

## Stale Deploy Detection

### How to Tell if Running Stale Code
1. Rebuild: `bun run build`
2. Compare: `diff dist/plugin.js ~/.opencode/plugins/token-monitor.js`
3. If files differ: the running plugin is stale

### Recovery
1. Copy fresh build: `cp dist/plugin.js ~/.opencode/plugins/token-monitor.js`
2. Restart OpenCode
3. Verify new features are active (e.g., antigravity compact indicator visible)
