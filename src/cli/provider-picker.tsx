import { Box, Text, useInput } from "ink";
import React, { useState } from "react";

interface ProviderPickerProps {
  providers: string[];
  activeProvider: string;
  onSelect: (provider: string) => void;
  onCancel: () => void;
}

export function ProviderPicker({
  providers,
  activeProvider,
  onSelect,
  onCancel,
}: ProviderPickerProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, Math.max(0, providers.length - 1));

  useInput((_char, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (providers[safeIdx]) {
        onSelect(providers[safeIdx]);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIdx((prev) => Math.min(providers.length - 1, prev + 1));
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Select Provider
        </Text>
        <Text color="gray"> (↑↓ navigate, Enter select, Esc cancel)</Text>
      </Box>

      {providers.length === 0 && (
        <Box>
          <Text color="red">No providers configured</Text>
        </Box>
      )}

      {providers.map((provider, idx) => {
        const isSelected = idx === safeIdx;
        const isActive = provider === activeProvider;

        return (
          <Box key={provider}>
            <Text color={isSelected ? "cyan" : undefined}>
              {isSelected ? "❯ " : "  "}
              {provider}
              {isActive ? " (active)" : ""}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
