# Ink UI Redesign — 2026-05-18

## Overview

Redesign the agent's Ink-based terminal UI to add a status bar below input, slash command autocomplete, and inline dim thinking text.

## Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [Model output area — scrollable]                           │
│    - Thinking: dim gray italic text (inline)               │
│    - Normal output: green text                             │
│    - Tool calls: yellow [Calling: toolName]                │
│    - User input echo: cyan                                 │
├─────────────────────────────────────────────────────────────┤
│  > user input here_                                        │ ← 1-line input
├─────────────────────────────────────────────────────────────┤
│ ↑12.3k ↓2.1k  45.2%/200k          (minimax) MiniMax-4-Flash │ ← status bar
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. StatusBar (new)

Always visible at bottom. Shows token stats and model info.

**Left side:**
- `↑{inputTokens} ↓{outputTokens} {percent}%/{contextWindow}`
- Token formatting: raw if <1000, `X.Xk` if 1k-10k, `XXk` if 10k+

**Right side:**
- `({provider}) {modelName}`

**Color coding:**
- Context % > 90%: red
- Context % > 70%: yellow
- Otherwise: default color

**Data source:** Adapter token counts accumulated across all turns in REPL.

### 2. Thinking (existing, no visual change)

- Inline dim gray text (`roleColor("thinking")` → "gray")
- Toggle visibility: `Ctrl+O` shows/hides thinking block
- Truncate at 100 lines with truncation notice

### 3. SlashCommandPopover (new)

Appears when input starts with `/`. Keyboard-navigable autocomplete.

**Display per command:**
- `/{trigger} — {description}`
- Source badge: `builtin`, `skill`, or `mcp`

**Keyboard navigation:**
- Up/down arrows to navigate
- Enter to select command
- Escape to close

**Data source:** `CommandRegistry.list()` — no changes to commands.ts needed.

### 4. InputArea

Combines the single-line input with the slash popover.

- `> ` prefix in blue
- Blinking cursor `█`
- Full-width single line
- Popover renders above input when `/` is typed

## Data Flow

```
REPL.processInput()
  → after assistant response:
      adapter.getUsage() → { input, output, cacheRead, cacheWrite }
      cumulate → this.cumulativeUsage
      → App.setStatusBar({ inputTokens, outputTokens, contextPercent, contextWindow, provider, model })
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/cli/app.tsx` | Add StatusBar component, InputArea with popover support, refactor renderApp bridge |
| `src/cli/repl.ts` | Track cumulative token usage, expose status data to app |
| `src/cli/commands.ts` | No changes (already exports list()) |
| `src/cli/index.ts` | Wire status data through renderApp |

## Implementation Order

1. StatusBar component (new)
2. SlashCommandPopover (new)
3. InputArea combining input + popover
4. Token tracking in REPL → App bridge
5. Status bar rendering with real data
6. Polish: colors, truncation, edge cases

## Reference

- pi `FooterComponent`: token stats formatting, context % color coding
- opencode `slash-popover.tsx`: keyboard navigation, source badges