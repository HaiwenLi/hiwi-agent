import { Box, Text, useInput } from "ink";
import React, { useState } from "react";

interface ApiKeyInputProps {
  provider: string;
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
}

export function ApiKeyInput({ provider, onSubmit, onCancel }: ApiKeyInputProps) {
  const [input, setInput] = useState("");
  const [showError, setShowError] = useState(false);

  useInput((_char, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (input.trim().length > 0) {
        onSubmit(input.trim());
      } else {
        setShowError(true);
        setTimeout(() => setShowError(false), 1500);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    // Allow all printable characters except control characters
    if (!_char || _char === "") return;
    if (key.ctrl || key.meta || key.return || key.tab) return;

    setInput((prev) => prev + _char);
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Enter API Key for {provider}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>The API key will be saved to .agent/config.json</Text>
      </Box>

      <Box>
        <Text color="blue">{"> "}</Text>
        <Text>{input || "(paste or type API key)"}</Text>
        <Text color="gray">█</Text>
      </Box>

      {showError && (
        <Box marginTop={1}>
          <Text color="red">API key cannot be empty</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Press Enter to save, Esc to cancel</Text>
      </Box>
    </Box>
  );
}
