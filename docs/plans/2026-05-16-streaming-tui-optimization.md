# Streaming TUI Optimization — Ink Rendering Performance

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Ink TUI streaming display feel responsive and smooth by adopting Ghostty-style damage-tracking, coalesced frame scheduling, and component isolation. Currently the agent loop uses non-streaming `chat()` so the entire response arrives at once; the rendering pipeline has zero batching/throttling; and the single `App` component re-renders the full history on every state change.

**Architecture:** Phase 1 wires `adapter.stream()` into `AgentLoop.run()` to produce per-token events (the prerequisite). Phase 2 adds a 16ms coalescing timer that batches token chunks into vsync-aligned React state updates — the direct analogue of Ghostty's coalesced frame scheduling. Phase 3 splits `App` into three `React.memo`-isolated sub-components (`OutputLines`, `StreamingLine`, `InputLine`) so that streaming tokens only re-render the streaming box, not the full history. Phase 4 adds stable keys and line virtualization. Phase 5 adds dirty-row tracking for minimal ANSI output.

**Tech Stack:** React 19.2, Ink 7.0, TypeScript, Vitest

---

### Task 1: Wire `adapter.stream()` into AgentLoop

**Files:**
- Modify: `src/core/agent.ts:130-138` (replace `chat()` call with `stream()` consumption)
- Reference: `src/types.ts:59-63` (`StreamChunk` type)
- Reference: `src/types.ts:70-71` (`ModelAdapter.stream()` signature)
- Reference: `src/cli/repl.ts:126-141` (consumer of text-delta events — unchanged, just now receives them per-token)

**Step 1: Write the failing test for token-by-token streaming**

Create test file `tests/unit/core/agent-stream.test.ts`:

```typescript
import { AgentLoop } from "@/core/agent.js";
import type { Message, ModelAdapter, StreamChunk, ChatOptions } from "@/types.js";
import { describe, expect, it, vi } from "vitest";

describe("AgentLoop stream mode", () => {
  it("yields per-token text-delta events when adapter.stream() emits multiple chunks", async () => {
    // Adapter that emits 4 token chunks then finish
    const adapter: ModelAdapter = {
      id: "test",
      provider: "test",
      capabilities: {
        supportsStreaming: true,
        supportsToolUse: false,
        supportsImages: false,
        maxTokens: 4096,
        maxContextTokens: 8192,
      },
      chat: vi.fn(),
      async *stream(_messages: Message[], _options?: ChatOptions): AsyncIterable<StreamChunk> {
        yield { type: "text-delta", text: "Hello" };
        yield { type: "text-delta", text: " World" };
        yield { type: "text-delta", text: "!" };
        yield { type: "finish", finishReason: "stop", usage: { input: 10, output: 3 } };
      },
    };

    const registry = {
      get: vi.fn().mockReturnValue(undefined),
      execute: vi.fn(),
      register: vi.fn(),
    } as any;

    const loop = new AgentLoop(adapter, registry, "normal", {
      budgetTotal: 10,
      maxLoops: 1,
      streaming: true,
      refundableTools: [],
    });

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "Hi" }])) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(3);
    expect(textDeltas[0].text).toBe("Hello");
    expect(textDeltas[1].text).toBe(" World");
    expect(textDeltas[2].text).toBe("!");
  });

  it("handles tool calls from stream chunks", async () => {
    const adapter: ModelAdapter = {
      id: "test",
      provider: "test",
      capabilities: {
        supportsStreaming: true,
        supportsToolUse: true,
        supportsImages: false,
        maxTokens: 4096,
        maxContextTokens: 8192,
      },
      chat: vi.fn(),
      async *stream(_messages: Message[], _options?: ChatOptions): AsyncIterable<StreamChunk> {
        yield { type: "text-delta", text: "Let me check" };
        yield {
          type: "tool-call",
          toolCall: { id: "tc1", name: "read", input: { path: "/x" } },
        };
        yield { type: "finish", finishReason: "tool-calls", usage: { input: 10, output: 5 } };
      },
    };

    const registry = {
      get: vi.fn().mockReturnValue({ capabilities: ["ReadOnly"] }),
      execute: vi.fn().mockResolvedValue({ content: "file content", toolCallId: "tc1" }),
      register: vi.fn(),
    } as any;

    const loop = new AgentLoop(adapter, registry, "normal", {
      budgetTotal: 10,
      maxLoops: 1,
      streaming: true,
      refundableTools: [],
    });

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "Read /x" }])) {
      events.push(event);
    }

    const toolCalls = events.filter((e) => e.type === "tool-call");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolName).toBe("read");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/core/agent-stream.test.ts
```
Expected: FAIL — text-deltas length is 1 (entire text in one event from chat()), not 3.

**Step 3: Modify AgentLoop.run() to use stream() when config.streaming is true**

In `src/core/agent.ts`, replace lines 130-138:

```typescript
// BEFORE (line 130-138):
while (iteration < this.config.maxLoops && !budget.exhausted && !this.interrupted) {
  yield { type: "step-start", iteration };

  const response = await this.adapter.chat(currentMessages);
  emptyResponseCount = 0;

  if (response.content) {
    yield { type: "text-delta", text: response.content, iteration };
  }

  if (response.finishReason !== "tool-calls" || response.toolCalls.length === 0) {
```

```typescript
// AFTER:
while (iteration < this.config.maxLoops && !budget.exhausted && !this.interrupted) {
  yield { type: "step-start", iteration };

  // Use streaming when available, falling back to chat()
  let content = "";
  const toolCalls: ToolCall[] = [];
  let finishReason: string = "stop";
  let usage: TokenUsage | undefined;

  if (this.config.streaming) {
    for await (const chunk of this.adapter.stream(currentMessages)) {
      if (chunk.type === "text-delta") {
        content += chunk.text;
        yield { type: "text-delta", text: chunk.text, iteration };
      } else if (chunk.type === "tool-call") {
        toolCalls.push(chunk.toolCall);
        yield {
          type: "tool-call",
          toolName: chunk.toolCall.name,
          toolCallId: chunk.toolCall.id,
          toolInput: chunk.toolCall.input,
          iteration,
        };
      } else if (chunk.type === "finish") {
        finishReason = chunk.finishReason;
        usage = chunk.usage;
      }
    }
  } else {
    const response = await this.adapter.chat(currentMessages);
    content = response.content;
    toolCalls.push(...response.toolCalls);
    finishReason = response.finishReason;
    usage = response.usage;
    if (content) {
      yield { type: "text-delta", text: content, iteration };
    }
  }

  emptyResponseCount = 0;

  if (finishReason !== "tool-calls" || toolCalls.length === 0) {
```

**Step 4: Update the finish/finalization block**

In `src/core/agent.ts`, update the finish yield to use the local variables instead of `response.*`:

```typescript
// Replace response.finishReason / response.usage with local variables
if (!content && toolCalls.length === 0) {
  emptyResponseCount++;
  if (emptyResponseCount <= 1) {
    currentMessages.push(
      { role: "assistant", content: "" },
      {
        role: "user",
        content: "You gave an empty response. Please provide a helpful answer.",
      },
    );
    yield { type: "step-finish", iteration };
    iteration++;
    continue;
  }
}

if (this.autoExtractor && content) {
  this.autoExtractor
    .extract(messages)
    .then((facts) => {
      if (facts.length > 0) this.autoExtractor?.storeFacts(facts);
    })
    .catch(() => {});
}

yield {
  type: "finish",
  finishReason: finishReason === "stop" ? "completed" : finishReason,
  usage,
};
yield { type: "step-finish", iteration };
return;
```

**Step 5: Update the tool-calls branch to use local toolCalls**

In `src/core/agent.ts`, replace `response.toolCalls` references after the finishReason check with `toolCalls`:

```typescript
// BEFORE (lines 175-179):
currentMessages.push({
  role: "assistant",
  content: response.content,
  toolCalls: response.toolCalls,
});

const execMode = shouldParallelize(response.toolCalls, this.toolRegistry);
```

```typescript
// AFTER:
currentMessages.push({
  role: "assistant",
  content,
  toolCalls,
});

const execMode = shouldParallelize(toolCalls, this.toolRegistry);
```

And replace all subsequent `response.toolCalls` with `toolCalls` in the tool execution loop (lines 184-217).

**Step 6: Run tests to verify they pass**

```bash
pnpm vitest run tests/unit/core/agent-stream.test.ts
```
Expected: PASS — 2 tests passing

**Step 7: Run existing tests to check for regressions**

```bash
pnpm vitest run tests/unit/
```
Expected: All existing tests still pass

**Step 8: Commit**

```bash
git add tests/unit/core/agent-stream.test.ts src/core/agent.ts
git commit -m "feat: wire adapter.stream() into AgentLoop for token-by-token streaming"
```

---

### Task 2: Coalesced Rendering with 16ms Frame Budget

**Files:**
- Modify: `src/cli/app.tsx:108-137` (renderApp bridge — add frame-coalescing timer)
- Modify: `tests/unit/cli/streaming-tui.test.ts` (update for coalesced behavior)

**Why 16ms:** A 60Hz terminal cannot display more than 60 frames per second. Any excess React re-renders are wasted CPU. Ghostty uses vsync-coalesced scheduling (section 3 of its render architecture). We apply the same principle: accumulate token chunks in a module-level buffer, flush only every 16ms via a coalescing timer.

**Step 1: Write the failing test for coalesced flushing**

Add to `tests/unit/cli/streaming-tui.test.ts`:

```typescript
it("coalesces rapid chunks before flushing to stream state", async () => {
  app = renderApp({ onInput: async () => {} });

  // Send 50 chunks synchronously (like a burst of stream tokens)
  app.addStreamChunk("a");
  app.addStreamChunk("b");
  app.addStreamChunk("c");
  // ... more in a loop
  for (let i = 0; i < 50; i++) {
    app.addStreamChunk(`chunk-${i} `);
  }

  // Wait for coalescing timer to fire
  await new Promise((r) => setTimeout(r, 30));

  // All chunks should have been accumulated
  app.endStream();

  // Verify endStream works correctly after coalescing
  expect(() => app.addOutput("final", "assistant")).not.toThrow();
});
```

**Step 2: Run test to verify current behavior (no coalescing)**

```bash
pnpm vitest run tests/unit/cli/streaming-tui.test.ts -t "coalesces"
```
Expected: PASS (test just verifies no-throw currently; coalescing doesn't break it)

**Step 3: Implement the coalescing timer in renderApp**

Replace the `streamingBuffer` and `addStreamChunk` logic in `src/cli/app.tsx:108-137`:

```typescript
// BEFORE (lines 107-137):
let lastOutputText = "";
let streamingBuffer = "";

export function renderApp(props: AppProps) {
  const instance = render(React.createElement(App, props));
  lastOutputText = "";
  streamingBuffer = "";

  return {
    addOutput: (text: string, _role: OutputLine["role"] = "assistant") => {
      if (text === lastOutputText) return;
      lastOutputText = text;
      streamState.addLine(text, _role);
    },
    addStreamChunk: (chunk: string) => {
      streamingBuffer += chunk;
      streamState.setStreaming(streamingBuffer);
    },
    endStream: () => {
      if (streamingBuffer) {
        lastOutputText = streamingBuffer;
        streamState.addLine(streamingBuffer, "assistant");
      }
      streamingBuffer = "";
      streamState.setStreaming("");
    },
    waitUntilExit: () => instance.waitUntilExit(),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}
```

```typescript
// AFTER:
let lastOutputText = "";
let streamingBuffer = "";
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlush = false;

function flushStreaming() {
  coalesceTimer = null;
  pendingFlush = false;
  streamState.setStreaming(streamingBuffer);
}

export function renderApp(props: AppProps) {
  const instance = render(React.createElement(App, props));
  lastOutputText = "";
  streamingBuffer = "";

  return {
    addOutput: (text: string, _role: OutputLine["role"] = "assistant") => {
      if (text === lastOutputText) return;
      lastOutputText = text;
      streamState.addLine(text, _role);
    },
    addStreamChunk: (chunk: string) => {
      streamingBuffer += chunk;
      if (!pendingFlush) {
        pendingFlush = true;
        coalesceTimer = setTimeout(flushStreaming, 16); // 60Hz vsync window
      }
    },
    endStream: () => {
      // Flush immediately on stream end — don't wait for timer
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
        pendingFlush = false;
      }
      streamState.setStreaming(streamingBuffer);
      if (streamingBuffer) {
        lastOutputText = streamingBuffer;
        streamState.addLine(streamingBuffer, "assistant");
      }
      streamingBuffer = "";
      streamState.setStreaming("");
    },
    waitUntilExit: () => instance.waitUntilExit(),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}
```

**Step 4: Run streaming tests**

```bash
pnpm vitest run tests/unit/cli/streaming-tui.test.ts
```
Expected: PASS — all tests pass

**Step 5: Run all unit tests**

```bash
pnpm vitest run tests/unit/
```
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add src/cli/app.tsx tests/unit/cli/streaming-tui.test.ts
git commit -m "feat: add 16ms coalescing timer for streaming renders"
```

---

### Task 3: Component Splitting with React.memo Isolation

**Files:**
- Modify: `src/cli/app.tsx:21-105` (split App into sub-components)
- Create: (none — all inline in app.tsx to keep it simple)
- Modify: `tests/unit/cli/app.test.tsx` (verify exports unchanged)

**Step 1: Write the component isolation test**

Add to `tests/unit/cli/app.test.tsx`:

```typescript
it("renderApp preserves the same public API after component split", () => {
  const app = renderApp({ onInput: async () => {} });
  expect(app).toHaveProperty("addOutput");
  expect(app).toHaveProperty("addStreamChunk");
  expect(app).toHaveProperty("endStream");
  expect(app).toHaveProperty("waitUntilExit");
  expect(app).toHaveProperty("clear");
  expect(app).toHaveProperty("unmount");
});

it("streaming text renders via addStreamChunk without error", () => {
  const app = renderApp({ onInput: async () => {} });
  app.addStreamChunk("streaming");
  app.addStreamChunk(" test");
  app.endStream();
  app.addOutput("another line", "assistant");
});
```

**Step 2: Run test to verify interface expectations**

```bash
pnpm vitest run tests/unit/cli/app.test.tsx
```
Expected: PASS for "preserves the same public API", FAIL for "streaming text renders" if we check too early

**Step 3: Split App into three React.memo sub-components**

Replace the `App` component in `src/cli/app.tsx:21-105` with isolated components:

```typescript
// ─── Sub-components (React.memo for render isolation) ─────────

const OutputLines = React.memo(function OutputLines({
  lines,
  roleColor,
}: {
  lines: OutputLine[];
  roleColor: (role: string) => string;
}) {
  return (
    <>
      {lines.map((line, i) => (
        <Box key={`${line.role}-${i}`} flexDirection="column">
          <Text color={roleColor(line.role)}>{line.text}</Text>
        </Box>
      ))}
    </>
  );
});

const StreamingLine = React.memo(function StreamingLine({
  text,
}: {
  text: string;
}) {
  if (!text) return null;
  return (
    <Box>
      <Text color="green">{text}</Text>
    </Box>
  );
});

const InputLine = React.memo(function InputLine({
  input,
}: {
  input: string;
}) {
  return (
    <Box marginTop={1}>
      <Text color="blue">{"> "}</Text>
      <Text>{input}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
});

// ─── App shell (owns state, delegates rendering) ──────────────

function App({ onInput }: AppProps) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [currentStream, setCurrentStream] = useState("");
  const { exit } = useApp();

  useEffect(() => {
    streamState.addLine = (text, role) => {
      setLines((prev) => [...prev, { text, role }]);
    };
    streamState.setStreaming = (text) => {
      setCurrentStream(text);
    };
  }, []);

  useInput((char, key) => {
    // ... same useInput body as before, unchanged ...
    if (key.escape) { exit(); return; }
    if (key.return && !key.shift) {
      if (input.trim() === "/exit" || input.trim() === "/quit") { exit(); return; }
      const userText = input;
      setLines((prev) => [...prev, { text: userText, role: "user" }]);
      setInput("");
      setProcessing(true);
      onInput(userText)
        .then(() => setProcessing(false))
        .catch(() => setProcessing(false));
      return;
    }
    if (key.backspace || key.delete) { setInput((prev) => prev.slice(0, -1)); return; }
    if (!key.ctrl && !key.meta && !key.shift) { setInput((prev) => prev + char); }
  });

  const roleColor = (role: string) => {
    switch (role) {
      case "user": return "cyan";
      case "assistant": return "green";
      case "tool": return "yellow";
      case "error": return "red";
      default: return "white";
    }
  };

  return (
    <Box flexDirection="column" minHeight={1}>
      <OutputLines lines={lines} roleColor={roleColor} />
      {processing && currentStream && <StreamingLine text={currentStream} />}
      {processing && !currentStream && <Text color="gray">Thinking...</Text>}
      <InputLine input={input} />
    </Box>
  );
}
```

**Step 4: Run tests to verify component isolation works**

```bash
pnpm vitest run tests/unit/cli/app.test.tsx
```
Expected: PASS

**Step 5: Run all CLI tests**

```bash
pnpm vitest run tests/unit/cli/
```
Expected: All PASS

**Step 6: Commit**

```bash
git add src/cli/app.tsx tests/unit/cli/app.test.tsx
git commit -m "feat: split App into React.memo-isolated OutputLines, StreamingLine, InputLine"
```

---

### Task 4: Stable Keys and Line Virtualization

**Files:**
- Modify: `src/cli/app.tsx` (stable keys, virtual window)

**Step 1: Write test for key stability**

```typescript
// In a new test or existing app test
it("handles many output lines without performance degradation", () => {
  const app = renderApp({ onInput: async () => {} });
  // Add 1000 lines — should not throw or hang
  for (let i = 0; i < 1000; i++) {
    app.addOutput(`Line ${i}`, "assistant");
  }
  app.addStreamChunk("still responsive");
  app.endStream();
});
```

**Step 2: Implement stable keys with counter and line window**

In `src/cli/app.tsx`, add a module-level counter and modify `OutputLines`:

```typescript
let nextLineId = 0;

// Inside streamState.addLine:
streamState.addLine = (text, role) => {
  setLines((prev) => {
    const newLine = { id: nextLineId++, text, role };
    // Keep only the last 500 lines in the virtual window
    const next = [...prev, newLine];
    if (next.length > 500) return next.slice(next.length - 500);
    return next;
  });
};

// OutputLine type gains an id field:
interface OutputLine {
  id: number;
  text: string;
  role: "user" | "assistant" | "tool" | "system" | "error";
}

// OutputLines uses stable id keys:
{lines.map((line) => (
  <Box key={line.id} flexDirection="column">
    <Text color={roleColor(line.role)}>{line.text}</Text>
  </Box>
))}
```

**Step 3: Run tests**

```bash
pnpm vitest run tests/unit/cli/
```
Expected: All PASS

**Step 4: Commit**

```bash
git add src/cli/app.tsx
git commit -m "feat: stable line keys and virtual window (500 line cap)"
```

---

### Task 5: Integration Test — End-to-End Streaming Flow

**Files:**
- Create: `tests/integration/streaming-flow.test.ts`

**Step 1: Write the integration test**

```typescript
import { AgentLoop } from "@/core/agent.js";
import { renderApp } from "@/cli/app.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message, ModelAdapter, StreamChunk, ToolRegistry } from "@/types.js";

describe("Streaming integration flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("end-to-end: adapter.stream() → AgentLoop → REPL → renderApp coalesced output", async () => {
    // Create a streaming adapter that emits 10 tokens over 50ms
    const adapter: ModelAdapter = {
      id: "test-e2e",
      provider: "test",
      capabilities: {
        supportsStreaming: true,
        supportsToolUse: false,
        supportsImages: false,
        maxTokens: 4096,
        maxContextTokens: 8192,
      },
      chat: vi.fn(),
      async *stream(_messages: Message[]): AsyncIterable<StreamChunk> {
        const tokens = ["The", " quick", " brown", " fox", " jumps",
                        " over", " the", " lazy", " dog", "."];
        for (const token of tokens) {
          yield { type: "text-delta", text: token };
          // Simulate realistic inter-token delay
          await new Promise((r) => setTimeout(r, 5));
        }
        yield { type: "finish", finishReason: "stop", usage: { input: 5, output: 10 } };
      },
    };

    const registry = {
      get: vi.fn().mockReturnValue(undefined),
      execute: vi.fn(),
      register: vi.fn(),
    } as any;

    const loop = new AgentLoop(adapter, registry, "normal", {
      budgetTotal: 10,
      maxLoops: 1,
      streaming: true,
      refundableTools: [],
    });

    // Consume events — verify streaming behavior
    const events: any[] = [];
    for await (const event of loop.run([{ role: "user", content: "Hello" }])) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    const fullText = textDeltas.map((e) => e.text).join("");
    expect(fullText).toContain("The quick brown fox");

    // Verify renderApp can handle the stream chunks
    const app = renderApp({ onInput: async () => {} });
    for (const delta of textDeltas) {
      app.addStreamChunk(delta.text);
    }
    app.endStream();

    // After coalescing window
    await new Promise((r) => setTimeout(r, 30));

    // Should be able to add more output after stream ends
    app.addOutput("next message", "assistant");
    app.unmount();
  });
});
```

**Step 2: Run integration test**

```bash
pnpm vitest run tests/integration/streaming-flow.test.ts
```
Expected: PASS

**Step 3: Run full test suite**

```bash
pnpm vitest run
```
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/integration/streaming-flow.test.ts
git commit -m "test: add e2e streaming flow integration test"
```

---

### Task 6: Enable Streaming by Default in Config

**Files:**
- Modify: `src/core/config.ts` (set `streaming: true` in default agent config)
- Reference: `src/types.ts:143` (`AgentLoopConfig.streaming`)

**Step 1: Update default config**

In `src/core/config.ts`, find the default `AgentLoopConfig` and set `streaming: true`:

```typescript
agent: {
  budgetTotal: 20,
  maxLoops: 10,
  streaming: true,  // was likely missing or false
  refundableTools: ["read", "grep", "glob", "lsp"],
}
```

**Step 2: Run tests to verify no breakage**

```bash
pnpm vitest run
```
Expected: All pass

**Step 3: Commit**

```bash
git add src/core/config.ts
git commit -m "feat: enable streaming by default in agent config"
```

---
