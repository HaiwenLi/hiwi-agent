import { Box, Text, render, useApp, useInput } from "ink";
import React, { memo, useEffect, useState } from "react";
import type { ModelEntry } from "../types.js";
import { ModelPicker } from "./model-picker.js";
import { ProviderPicker } from "./provider-picker.js";

export interface AppProps {
  onInput: (text: string) => Promise<void>;
  onModelSelect?: (modelId: string) => void;
  onProviderSelect?: (provider: string) => void;
  onPickerCancel?: () => void;
}

export interface OutputLine {
  id: number;
  text: string;
  role: "user" | "assistant" | "tool" | "system" | "error";
  streaming?: boolean;
}

// Module-level bridge: the App component wires its state setters here,
// and renderApp writes into them so streaming flows through Ink's VDOM.
const streamState = {
  addLine: (_text: string, _role: OutputLine["role"]) => {},
  setStreaming: (_text: string) => {},
};

const modeState = {
  openModelPicker: (
    _catalog: Record<string, ModelEntry[]>,
    _activeModel: string,
    _activeProvider: string,
  ) => {},
  openProviderPicker: (_providers: string[], _activeProvider: string) => {},
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
    default:
      return "white";
  }
};

const OutputLines = memo(function OutputLines({
  lines,
}: {
  lines: OutputLine[];
}) {
  return (
    <>
      {lines.map((line) => (
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

const InputLine = memo(function InputLine({ input }: { input: string }) {
  return (
    <Box marginTop={1}>
      <Text color="blue">{"> "}</Text>
      <Text>{input}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
});

function App({ onInput, onModelSelect, onProviderSelect, onPickerCancel }: AppProps) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [currentStream, setCurrentStream] = useState("");
  const [mode, setMode] = useState<"chat" | "model-picker" | "provider-picker">("chat");
  const [catalog, setCatalog] = useState<Record<string, ModelEntry[]>>({});
  const [providers, setProviders] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [activeProvider, setActiveProvider] = useState("");
  const { exit } = useApp();

  useEffect(() => {
    streamState.addLine = (text, role) => {
      pushLine(setLines, text, role);
    };
    streamState.setStreaming = (text) => {
      setCurrentStream(text);
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
  }, []);

  useInput((char, key) => {
    if (mode !== "chat") return;

    if (key.escape) {
      exit();
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
      setInput((prev) => prev + char);
    }
  });

  return (
    <Box flexDirection="column" minHeight={1}>
      {mode === "chat" && (
        <>
          <OutputLines lines={lines} />
          {processing && currentStream && <StreamingLine text={currentStream} />}
          {processing && !currentStream && <Text color="gray">Thinking...</Text>}
          <InputLine input={input} />
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
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlush = false;

function flushStreaming() {
  coalesceTimer = null;
  pendingFlush = false;
  streamState.setStreaming(streamingBuffer);
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
    openModelPicker: modeState.openModelPicker,
    openProviderPicker: modeState.openProviderPicker,
    waitUntilExit: () => instance.waitUntilExit(),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}
