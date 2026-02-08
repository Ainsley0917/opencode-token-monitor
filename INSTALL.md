# Installation Guide

## Local Plugin Installation

To install `opencode-token-monitor` as a local OpenCode plugin:

### Option 1: Copy Plugin File (Recommended for Testing)

```bash
cp plugin/index.ts ~/.opencode/plugins/token-monitor.ts
```

### Option 2: Symlink (Recommended for Development)

```bash
ln -s $(pwd)/plugin/index.ts ~/.opencode/plugins/token-monitor.ts
```

**Note:** The plugin also requires the library modules. Ensure OpenCode can resolve the relative imports, or bundle the plugin as a single file.

## Bundling for Distribution

For production use, bundle the plugin into a single file:

```bash
# TODO: Add bundling step if needed
# This may require adjusting tsconfig or using a bundler
```

## Verification

After installation, start OpenCode and ask:

```
"Call the token_stats tool and show the output"
```

The AI should invoke the tool and display token usage statistics.

## Custom Pricing Configuration

Create a `pricing.json` file in your project root to override default model pricing:

```json
{
  "anthropic/claude-sonnet-4": {
    "input_per_million": 3.00,
    "output_per_million": 15.00
  },
  "openai/gpt-4o": {
    "input_per_million": 2.50,
    "output_per_million": 10.00
  }
}
```

See `pricing.example.json` for a complete example.
