# Task 04: Streaming TUI Display

**Files:**
- Modify: `src/cli/app.tsx`
- Modify: `src/cli/repl.ts`
- Create: `tests/unit/cli/streaming-tui.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — CLI / TUI

## Goal

Replace the basic Ink TUI with a streaming display that shows assistant responses token-by-token as they arrive from the LLM, with proper formatting for tool calls and code blocks.

## Current State

```typescript
// src/cli/app.tsx — current implementation:
// - Single-line input only
// - No streaming (waits for full response)
// - No formatting (plain text)
// - addOutput() writes to process.stdout directly
```

## Target Behavior

1. **Streaming input**: Show tokens as they arrive from the LLM adapter
2. **Multi-line input**: Support Shift+Enter for multi-line, Enter to submit
3. **Rich formatting**:
   - Markdown rendering (headers, bold, code blocks, lists)
   - Tool call indicators with spinners
   - Error messages in red
4. **Scrollable output**: Previous messages scroll up, current response streams at bottom

## Interface Changes

```typescript
// src/cli/app.tsx

interface AppProps {
  onInput: (text: string) => Promise<void>;
  onStream?: (callback: (chunk: string) => void) => void; // NEW: streaming callback
}

interface OutputLine {
  text: string;
  role: "user" | "assistant" | "tool" | "system" | "error";
  streaming?: boolean;  // NEW: is this line still being streamed?
}
```

## Streaming Flow

```
User submits → onInput(text)
                ↓
Agent starts streaming → calls addStreamChunk(chunk)
                ↓
App appends chunks to current assistant line
                ↓
Stream completes → finalize line, remove streaming flag
```

## Ink Components

- `<MarkdownText>` — renders markdown inline (code, bold, links)
- `<ToolCallIndicator>` — shows tool name + spinner while executing
- `<InputStream>` — handles multi-line input with Enter/Shift+Enter

## Edge Cases

- Very fast streaming (batch chunks to avoid excessive re-renders)
- Very long responses (virtual scrolling or truncate with "...")
- ANSI escape codes in streaming output (sanitize)
- Window resize during streaming

## Tests

- Stream chunks render incrementally
- Markdown formatting applied to streamed content
- Tool call indicators show during execution
- Multi-line input works (Shift+Enter)
- Large responses don't crash the TUI
- Window resize handled gracefully
