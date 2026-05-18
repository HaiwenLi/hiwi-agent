# Ink UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add status bar below input, slash command popover, and inline dim thinking to the Ink terminal UI.

**Architecture:** Add StatusBar component at bottom of layout. Add SlashCommandPopover that appears above input when `/` is typed. Track cumulative token usage in REPL and expose via renderApp bridge. No structural changes to output area — thinking already handled via gray color role.

**Tech Stack:** Ink (React-based TUI), React hooks (useState, useEffect, useInput)

---

## Preconditions

Before starting, verify you have:
- `src/cli/app.tsx` — current Ink app
- `src/cli/repl.ts` — REPL class with processInput
- `src/cli/commands.ts` — CommandRegistry with list()
- Working `npm run build` and `npm run repl` (or equivalent)

---

## Task 1: Add Token Usage Types

**Files:**
- Modify: `src/types.ts` (or create types if not exists)

**Step 1: Add StatusBarData type**

Add to the types file:
```typescript
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  contextPercent: number | null;
  contextWindow: number;
  modelName: string;
  provider: string;
}

export interface StatusBarData {
  tokens: TokenUsage;
  visible: boolean;
}
```

**Step 2: Commit**

---

## Task 2: Extend REPL to Track Cumulative Token Usage

**Files:**
- Modify: `src/cli/repl.ts:34-55`

**Step 1: Add usage tracking properties**

Add to REPL class properties (after line 41):
```typescript
private cumulativeInputTokens = 0;
private cumulativeOutputTokens = 0;
private cumulativeCacheRead = 0;
private cumulativeCacheWrite = 0;
```

**Step 2: Add getStatusBarData method**

Add after `buildCommandContext()` (around line 232):
```typescript
getStatusBarData(): TokenUsage {
  return {
    inputTokens: this.cumulativeInputTokens,
    outputTokens: this.cumulativeOutputTokens,
    cacheReadTokens: this.cumulativeCacheRead,
    cacheWriteTokens: this.cumulativeCacheWrite,
    contextPercent: null, // Will be calculated after adapter response
    contextWindow: 0,    // Will be set from adapter
    modelName: "",
    provider: "",
  };
}
```

**Step 3: Track usage in chat method**

After the adapter is obtained in `chat()` (line 133), after the for-await loop completes and flushBuffer is called, add usage tracking:
```typescript
// After flushBuffer() and before return fullOutput
const adapter = this.deps.providerRegistry.getActiveAdapter();
const usage = (adapter as any).getUsage?.() ?? (adapter as any).usage;
if (usage) {
  this.cumulativeInputTokens += usage.inputTokens ?? usage.input ?? 0;
  this.cumulativeOutputTokens += usage.outputTokens ?? usage.output ?? 0;
  this.cumulativeCacheRead += usage.cacheReadTokens ?? usage.cacheRead ?? 0;
  this.cumulativeCacheWrite += usage.cacheWriteTokens ?? usage.cacheWrite ?? 0;
}
```

**Step 4: Commit**

---

## Task 3: Add StatusBar Component to app.tsx

**Files:**
- Modify: `src/cli/app.tsx`

**Step 1: Add formatTokens helper**

Add before App function (around line 56):
```typescript
function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}
```

**Step 2: Add StatusBar component**

Add after OutputLines component (around line 117):
```typescript
const StatusBar = memo(function StatusBar({ data }: { data: TokenUsage }) {
  const contextPercentStr = data.contextPercent !== null
    ? `${data.contextPercent.toFixed(1)}%`
    : "?";

  let percentColor = "white";
  if (data.contextPercent !== null) {
    if (data.contextPercent > 90) percentColor = "red";
    else if (data.contextPercent > 70) percentColor = "yellow";
  }

  const left = `↑${formatTokens(data.inputTokens)} ↓${formatTokens(data.outputTokens)}  ${contextPercentStr}/${formatTokens(data.contextWindow)}`;
  const right = `(${data.provider}) ${data.modelName}`;

  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Text color={percentColor}>{left}</Text>
      <Text>{right}</Text>
    </Box>
  );
});
```

**Step 3: Add statusBar state**

Add to App function state (around line 145):
```typescript
const [statusBarData, setStatusBarData] = useState<TokenUsage>({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  contextPercent: null,
  contextWindow: 200000,
  modelName: "",
  provider: "",
});
```

**Step 4: Add statusBar render**

Add status bar rendering in the chat mode section (around line 238, after InputLine):
```typescript
<InputLine input={input} />
<StatusBar data={statusBarData} />
```

**Step 5: Expose setStatusBarData via module-level bridge**

Add to streamState (around line 25):
```typescript
const streamState = {
  addLine: (_text: string, _role: OutputLine["role"]) => {},
  setStreaming: (_text: string) => {},
  setStatusBarData: (_data: TokenUsage) => {},
};
```

Add in useEffect (around line 161):
```typescript
streamState.setStatusBarData = (data) => {
  setStatusBarData(data);
};
```

**Step 6: Commit**

---

## Task 4: Add SlashCommandPopover Component

**Files:**
- Modify: `src/cli/app.tsx`

**Step 1: Add command list state**

Add to App function state (around line 145):
```typescript
const [commandList, setCommandList] = useState<Command[]>([]);
const [slashActiveIndex, setSlashActiveIndex] = useState(0);
const [showSlashPopover, setShowSlashPopover] = useState(false);
```

**Step 2: Add SlashCommandPopover component**

Add after StatusBar (around line 150):
```typescript
const SlashCommandPopover = memo(function SlashCommandPopover({
  commands,
  activeIndex,
  onSelect,
}: {
  commands: Command[];
  activeIndex: number;
  onSelect: (cmd: Command) => void;
}) {
  if (commands.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      {commands.map((cmd, i) => (
        <Box key={cmd.name}>
          <Text
            color={i === activeIndex ? "blue" : "white"}
            bold={i === activeIndex}
          >
            {i === activeIndex ? "> " : "  "}
            /{cmd.name.padEnd(12)} — {cmd.description}
          </Text>
        </Box>
      ))}
    </Box>
  );
});
```

**Step 3: Add input handling for slash commands**

Modify the useInput handler (around line 184) to detect `/` at start:
```typescript
// Add this in useInput, after the escape handler
if (char === "/" && input === "") {
  setShowSlashPopover(true);
  setSlashActiveIndex(0);
  // Fetch commands - we'll add this via streamState later
}
```

Actually, we need to pass commands from outside. Add command fetching to the useEffect that sets up streamState (around line 161):
```typescript
// In useEffect, after other streamState assignments
fetchCommands?.().then(setCommandList);
```

We need to also add `fetchCommands` to streamState if it exists in REPL. But for simplicity, let's have REPL expose commands list directly via streamState.

Add to streamState (line 25):
```typescript
const streamState = {
  addLine: (_text: string, _role: OutputLine["role"]) => {},
  setStreaming: (_text: string) => {},
  setStatusBarData: (_data: TokenUsage) => {},
  commands: [] as Command[],
};
```

Update in useEffect (line 161):
```typescript
streamState.commands = commandList;
```

**Step 4: Add popover rendering**

Add after InputLine and StatusBar in the chat mode render (around line 238):
```typescript
{showSlashPopover && (
  <SlashCommandPopover
    commands={commandList}
    activeIndex={slashActiveIndex}
    onSelect={(cmd) => {
      setInput(`/${cmd.name} `);
      setShowSlashPopover(false);
    }}
  />
)}
```

**Step 5: Add keyboard navigation for popover**

In useInput, add arrow key handling when popover is shown:
```typescript
if (showSlashPopover) {
  if (key.upArrow) {
    setSlashActiveIndex(i => Math.max(0, i - 1));
    return;
  }
  if (key.downArrow) {
    setSlashActiveIndex(i => Math.min(commandList.length - 1, i + 1));
    return;
  }
  if (key.return) {
    const cmd = commandList[slashActiveIndex];
    if (cmd) {
      setInput(`/${cmd.name} `);
      setShowSlashPopover(false);
    }
    return;
  }
  if (key.escape) {
    setShowSlashPopover(false);
    return;
  }
}
```

**Step 6: Commit**

---

## Task 5: Wire Token Tracking from REPL to App

**Files:**
- Modify: `src/cli/repl.ts`
- Modify: `src/cli/app.tsx`
- Modify: `src/cli/index.ts`

**Step 1: In REPL, after each assistant message, update status bar**

In the `chat()` method, after `flushBuffer()` and before returning, add:
```typescript
// Update status bar data
const statusData = this.getStatusBarData();
const adapter = this.deps.providerRegistry.getActiveAdapter();
const model = (adapter as any).model;
const provider = (adapter as any).provider;

statusData.modelName = model?.id ?? "unknown";
statusData.provider = provider ?? "unknown";
statusData.contextWindow = model?.contextWindow ?? 200000;

if (statusData.contextWindow > 0) {
  const totalTokens = statusData.inputTokens + statusData.outputTokens;
  statusData.contextPercent = (totalTokens / statusData.contextWindow) * 100;
}

// Note: We need to call back to the app via a callback set on REPL
// Add this callback mechanism - see step 2
```

Actually, REPL doesn't have direct access to App's setStatusBarData. We need to pass a callback. Add to REPL constructor deps (around line 20):
```typescript
onStatusBarUpdate?: (data: TokenUsage) => void;
```

Then call it in chat() after usage tracking:
```typescript
this.deps.onStatusBarUpdate?.(this.getStatusBarData());
```

**Step 2: In index.ts, wire the callback**

Find where REPL is instantiated (grep for `new REPL`). Add:
```typescript
const repl = new REPL({
  // ... existing deps
  onStatusBarUpdate: (data) => {
    appBridge?.setStatusBarData(data);
  },
});
```

**Step 3: Expose setStatusBarData on app bridge**

In app.tsx, add to the return of renderApp (around line 332):
```typescript
return {
  // ... existing methods
  setStatusBarData: (data: TokenUsage) => {
    streamState.setStatusBarData(data);
  },
  // ...
};
```

Actually streamState already has setStatusBarData. We just need to make sure the App component updates its state when called. The useEffect already handles this.

**Step 4: Commit**

---

## Task 6: Add Command List to renderApp Bridge

**Files:**
- Modify: `src/cli/app.tsx`
- Modify: `src/cli/index.ts`

**Step 1: Add command list to streamState**

In streamState (line 25), commands is already there. But we need to populate it. Change streamState to:
```typescript
const streamState = {
  addLine: (_text: string, _role: OutputLine["role"]) => {},
  setStreaming: (_text: string) => {},
  setStatusBarData: (_data: TokenUsage) => {},
  commands: [] as Command[],
  updateCommands: (_cmds: Command[]) => {
    streamState.commands = _cmds;
  },
};
```

**Step 2: In useEffect, poll for command updates**

Actually simpler: just call `ctx.commandRegistry.list()` to get commands when popover opens. Modify the `/` detection in useInput to fetch commands directly.

**Step 3: Commit**

---

## Task 7: Initial Command List Fetch

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Fetch commands on app init**

In the useEffect in App, after streamState setters, fetch commands:
```typescript
// Fetch command list
fetchCommands?.().then((cmds) => {
  setCommandList(cmds);
  streamState.commands = cmds;
});
```

Where `fetchCommands` comes from REPL. We need to pass it via deps. Add to REPLDependencies:
```typescript
fetchCommands?: () => Promise<Command[]>;
```

In REPL, add:
```typescript
fetchCommands = async (): Promise<Command[]> => {
  return this.deps.commandRegistry.list();
};
```

**Step 2: Pass fetchCommands to app**

In index.ts where renderApp is called, add:
```typescript
const appBridge = renderApp({
  onInput: (text) => repl.processInput(text),
  // ... existing props
  fetchCommands: () => repl.fetchCommands(),
});
```

**Step 3: Commit**

---

## Task 8: Integration Test and Polish

**Step 1: Build and run**

Run: `npm run build`
Fix any TypeScript errors.

**Step 2: Run REPL**

Run: `npm run repl` (or equivalent)

**Step 3: Test status bar**

Send a message, verify token counts appear in status bar after response.

**Step 4: Test slash popover**

Type `/` and verify command list appears. Use arrow keys to navigate. Press Enter to select.

**Step 5: Test Ctrl+O thinking toggle**

Verify thinking shows/hides.

**Step 6: Commit**

---

## File Summary

| File | Changes |
|------|---------|
| `src/types.ts` | Add TokenUsage, StatusBarData interfaces |
| `src/cli/repl.ts` | Track cumulative tokens, add getStatusBarData, fetchCommands |
| `src/cli/app.tsx` | Add StatusBar, SlashCommandPopover, InputArea components |
| `src/cli/index.ts` | Wire REPL ↔ App callbacks, fetchCommands |
| `src/cli/commands.ts` | No changes (already exports list()) |

---

## Notes

- Token tracking depends on adapter exposing usage. MiniMax adapter may not expose it — may show `?` for context % until adapter is updated.
- Slash popover keyboard nav is basic (up/down/enter/esc). No mouse support needed for terminal UI.
- Context % color thresholds: >90% red, >70% yellow, else white.
- Token formatting: raw if <1000, `X.Xk` if 1k-10k, `XXk` if 10k+.