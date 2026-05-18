import { Box, Text, render, useApp, useInput } from "ink";
import React, { memo, useEffect, useState } from "react";
import type { Command } from "./commands.js";
import type { ModelEntry, TokenUsage } from "../types.js";
import { ApiKeyInput } from "./api-key-input.js";
import { ModelPicker } from "./model-picker.js";
import { ProviderPicker } from "./provider-picker.js";

export interface AppProps {
  onInput: (text: string) => Promise<void>;
  onModelSelect?: (modelId: string) => void;
  onProviderSelect?: (provider: string) => void;
  onApiKeySubmit?: (provider: string, apiKey: string) => void;
  onPickerCancel?: () => void;
  fetchCommands?: () => Promise<Command[]>;
}

export interface OutputLine {
  id: number;
  text: string;
  role: "user" | "assistant" | "tool" | "system" | "error" | "thinking";
  streaming?: boolean;
}

// Module-level bridge: the App component wires its state setters here,
// and renderApp writes into them so streaming flows through Ink's VDOM.
const streamState = {
  addLine: (_text: string, _role: OutputLine["role"]) => {},
  setStreaming: (_text: string) => {},
  setStatusBarData: (_data: TokenUsage) => {},
  commands: [] as Command[],
};

const modeState = {
  openModelPicker: (
    _catalog: Record<string, ModelEntry[]>,
    _activeModel: string,
    _activeProvider: string,
  ) => {},
  openProviderPicker: (_providers: string[], _activeProvider: string) => {},
  openApiKeyInput: (_provider: string) => {},
};

const roleColor = (role: string) => {
  switch (role) {
    case "user":
      return "cyan";
    case "assistant":
      return "green";
    case "tool":
      return "yellow";
    case "error":
      return "red";
    case "thinking":
      return "gray";
    default:
      return "white";
  }
};

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

const MAX_THINKING_LINES = 100;

function truncateThinkingLines(lines: OutputLine[]): OutputLine[] {
  const thinkingLines = lines.filter((l) => l.role === "thinking");
  if (thinkingLines.length <= MAX_THINKING_LINES) {
    return lines;
  }

  // Truncate thinking lines to MAX_THINKING_LINES
  const result: OutputLine[] = [];
  let thinkingCount = 0;
  let inThinkingBlock = false;

  for (const line of lines) {
    if (line.role === "thinking") {
      if (!inThinkingBlock) {
        inThinkingBlock = true;
        thinkingCount = 0;
      }
      thinkingCount++;
      if (thinkingCount <= MAX_THINKING_LINES) {
        result.push(line);
      } else if (thinkingCount === MAX_THINKING_LINES + 1) {
        // Add truncation message
        result.push({
          id: line.id,
          text: `\n... (${thinkingLines.length - MAX_THINKING_LINES} more thinking lines, press Ctrl+O to show all) ...\n`,
          role: "thinking",
        });
      }
    } else {
      inThinkingBlock = false;
      result.push(line);
    }
  }

  return result;
}

const OutputLines = memo(function OutputLines({
  lines,
  showThinking,
}: {
  lines: OutputLine[];
  showThinking: boolean;
}) {
  // Filter or truncate thinking lines based on showThinking
  const displayLines = showThinking
    ? lines
    : truncateThinkingLines(lines.filter((l) => l.role !== "thinking"));

  return (
    <>
      {displayLines.map((line) => (
        <Box key={line.id} flexDirection="column">
          <Text color={roleColor(line.role)}>{line.text}</Text>
        </Box>
      ))}
    </>
  );
});

const StreamingLine = memo(function StreamingLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <Box>
      <Text color="green">{text}</Text>
    </Box>
  );
});

const StatusBar = memo(function StatusBar({ data }: { data: TokenUsage }) {
  const contextPercentStr = data.contextPercent != null
    ? `${data.contextPercent.toFixed(1)}%`
    : "?";

  let percentColor = "white";
  if (data.contextPercent != null) {
    if (data.contextPercent > 90) percentColor = "red";
    else if (data.contextPercent > 70) percentColor = "yellow";
  }

  const left = `↑${formatTokens(data.inputTokens)} ↓${formatTokens(data.outputTokens)}  ${contextPercentStr}/${formatTokens(data.contextWindow ?? 200000)}`;
  const right = `${data.provider} ${data.modelName}`;

  return (
    <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
      <Text color={percentColor}>{left}</Text>
      <Text>{right}</Text>
    </Box>
  );
});

const InputLine = memo(function InputLine({ input }: { input: string }) {
  return (
    <Box marginTop={1}>
      <Text color="blue">{"> "}</Text>
      <Text>{input}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
});

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
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
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

function App({
  onInput,
  onModelSelect,
  onProviderSelect,
  onApiKeySubmit,
  onPickerCancel,
  fetchCommands,
}: AppProps) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [currentStream, setCurrentStream] = useState("");
  const [showThinking, setShowThinking] = useState(false);
  const [mode, setMode] = useState<"chat" | "model-picker" | "provider-picker" | "api-key-input">(
    "chat",
  );
  const [catalog, setCatalog] = useState<Record<string, ModelEntry[]>>({});
  const [providers, setProviders] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [activeProvider, setActiveProvider] = useState("");
  const [pendingProvider, setPendingProvider] = useState<string>("");
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
  const [commandList, setCommandList] = useState<Command[]>([]);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [showSlashPopover, setShowSlashPopover] = useState(false);
  const { exit } = useApp();

  useEffect(() => {
    streamState.addLine = (text, role) => {
      pushLine(setLines, text, role);
    };
    streamState.setStreaming = (text) => {
      setCurrentStream(text);
    };
    streamState.setStatusBarData = (data) => {
      setStatusBarData(data);
    };
    modeState.openModelPicker = (cat, am, ap) => {
      setCatalog(cat);
      setActiveModel(am);
      setActiveProvider(ap);
      setMode("model-picker");
    };
    modeState.openProviderPicker = (p, ap) => {
      setProviders(p);
      setActiveProvider(ap);
      setMode("provider-picker");
    };
    modeState.openApiKeyInput = (provider) => {
      setPendingProvider(provider);
      setMode("api-key-input");
    };
    // Fetch command list on init
    fetchCommands?.().then((cmds) => {
      setCommandList(cmds);
      streamState.commands = cmds;
    });
  }, [fetchCommands]);

  useInput((char, key) => {
    if (mode !== "chat") return;

    if (showSlashPopover) {
      if (key.upArrow) {
        setSlashActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSlashActiveIndex((i) => Math.min(commandList.length - 1, i + 1));
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

    if (key.escape) {
      exit();
      return;
    }

    if (key.ctrl && char === "o") {
      setShowThinking((prev) => !prev);
      return;
    }

    if (key.return && !key.shift) {
      if (input.trim() === "/exit" || input.trim() === "/quit") {
        exit();
        return;
      }

      const userText = input;
      pushLine(setLines, userText, "user");
      setInput("");
      setProcessing(true);

      onInput(userText)
        .then(() => setProcessing(false))
        .catch(() => setProcessing(false));
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && !key.shift) {
      const newInput = input + char;
      if (char === "/" && input === "") {
        setShowSlashPopover(true);
        setSlashActiveIndex(0);
        setInput(newInput);
      } else {
        setInput(newInput);
      }
    }
  });

  return (
    <Box flexDirection="column" minHeight={1}>
      {mode === "chat" && (
        <>
          {showThinking && (
            <Box marginBottom={1}>
              <Text color="gray" bold>
                [Thinking: FULL] Press Ctrl+O to hide
              </Text>
            </Box>
          )}
          <OutputLines lines={lines} showThinking={showThinking} />
          {processing && currentStream && <StreamingLine text={currentStream} />}
          {processing && !currentStream && <Text color="gray">Thinking...</Text>}
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
          <InputLine input={input} />
          <StatusBar data={statusBarData} />
        </>
      )}
      {mode === "model-picker" && (
        <ModelPicker
          modelsByProvider={catalog}
          activeModel={activeModel}
          activeProvider={activeProvider}
          onSelect={(modelId) => {
            setMode("chat");
            onModelSelect?.(modelId);
          }}
          onCancel={() => {
            setMode("chat");
            onPickerCancel?.();
          }}
        />
      )}
      {mode === "provider-picker" && (
        <ProviderPicker
          providers={providers}
          activeProvider={activeProvider}
          onSelect={(provider) => {
            setMode("chat");
            onProviderSelect?.(provider);
          }}
          onCancel={() => {
            setMode("chat");
            onPickerCancel?.();
          }}
        />
      )}
      {mode === "api-key-input" && (
        <ApiKeyInput
          provider={pendingProvider}
          onSubmit={(apiKey) => {
            setMode("chat");
            onApiKeySubmit?.(pendingProvider, apiKey);
          }}
          onCancel={() => {
            setMode("chat");
            onPickerCancel?.();
          }}
        />
      )}
    </Box>
  );
}

let nextLineId = 0;
const MAX_LINES = 500;
let lastOutputText = "";

function pushLine(
  setLines: React.Dispatch<React.SetStateAction<OutputLine[]>>,
  text: string,
  role: OutputLine["role"],
) {
  setLines((prev) => {
    const next = [...prev, { id: nextLineId++, text, role }];
    return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
  });
}
let streamingBuffer = "";
let thinkingBuffer = "";
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlush = false;

function flushStreaming() {
  coalesceTimer = null;
  pendingFlush = false;
  streamState.setStreaming(streamingBuffer);
}

function flushThinking() {
  coalesceTimer = null;
  pendingFlush = false;
  if (thinkingBuffer) {
    streamState.addLine(thinkingBuffer, "thinking");
    thinkingBuffer = "";
  }
}

export function renderApp(props: AppProps) {
  const instance = render(React.createElement(App, props));
  nextLineId = 0;
  lastOutputText = "";
  streamingBuffer = "";
  if (coalesceTimer) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
  pendingFlush = false;

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
        coalesceTimer = setTimeout(flushStreaming, 16);
      }
    },
    addThinkingChunk: (chunk: string) => {
      thinkingBuffer += chunk;
      if (!pendingFlush) {
        pendingFlush = true;
        coalesceTimer = setTimeout(flushThinking, 16);
      }
    },
    endStream: () => {
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
    endThinking: () => {
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
        pendingFlush = false;
      }
      flushThinking();
    },
    openModelPicker: modeState.openModelPicker,
    openProviderPicker: modeState.openProviderPicker,
    openApiKeyInput: modeState.openApiKeyInput,
    setStatusBarData: (data: TokenUsage) => {
      streamState.setStatusBarData(data);
    },
    waitUntilExit: () => instance.waitUntilExit(),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}
