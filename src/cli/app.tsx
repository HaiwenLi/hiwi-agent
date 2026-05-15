import { Box, Text, render, useApp, useInput } from "ink";
import React, { useState } from "react";

export interface AppProps {
  onInput: (text: string) => Promise<void>;
}

export interface OutputLine {
  text: string;
  role: "user" | "assistant" | "tool" | "system" | "error";
  streaming?: boolean;
}

function App({ onInput }: AppProps) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const { exit } = useApp();

  useInput((char, key) => {
    if (key.escape) {
      exit();
      return;
    }

    if (key.return) {
      if (input.trim() === "/exit" || input.trim() === "/quit") {
        exit();
        return;
      }

      const userText = input;
      setLines((prev) => [...prev, { text: userText, role: "user" }]);
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

    setInput((prev) => prev + char);
  });

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

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Box key={i} flexDirection="column">
          <Text color={roleColor(line.role)}>{line.text}</Text>
        </Box>
      ))}
      {processing && <Text color="gray">Thinking...</Text>}
      <Box marginTop={1}>
        <Text color="blue">{"\n> "}</Text>
        <Text>{input}</Text>
        <Text color="gray">█</Text>
      </Box>
    </Box>
  );
}

class StreamController {
  private currentLine = "";
  private active = false;

  beginStream(): void {
    this.active = true;
    this.currentLine = "";
  }

  addChunk(chunk: string): void {
    if (!this.active) {
      this.beginStream();
    }
    this.currentLine += chunk;
    process.stdout.write(chunk);
  }

  endStream(): void {
    if (!this.active) return;
    this.active = false;
    process.stdout.write("\n");
    this.currentLine = "";
  }
}

export function renderApp(props: AppProps) {
  const instance = render(React.createElement(App, props));
  const streamController = new StreamController();

  return {
    addOutput: (text: string, _role: OutputLine["role"] = "assistant") => {
      process.stdout.write(`${text}\n`);
    },
    addStreamChunk: (chunk: string) => {
      streamController.addChunk(chunk);
    },
    endStream: () => {
      streamController.endStream();
    },
    waitUntilExit: () => instance.waitUntilExit(),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}
