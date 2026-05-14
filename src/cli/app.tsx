import { Box, Text, render, useApp, useInput } from "ink";
import React, { useState } from "react";

export interface AppProps {
  onInput: (text: string) => Promise<void>;
}

interface OutputLine {
  text: string;
  role: "user" | "assistant" | "tool" | "system" | "error";
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
        <Text color="blue">&gt; </Text>
        <Text>{input}</Text>
        <Text color="gray">█</Text>
      </Box>
    </Box>
  );
}

export function renderApp(props: AppProps) {
  const instance = render(React.createElement(App, props));

  return {
    addOutput: (text: string, _role: OutputLine["role"] = "assistant") => {
      process.stdout.write(`${text}\n`);
    },
    waitUntilExit: () => instance.waitUntilExit(),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}
