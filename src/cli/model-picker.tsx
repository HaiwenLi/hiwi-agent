import { Box, Text, useInput } from "ink";
import React, { useState } from "react";
import type { ModelEntry } from "../types.js";

interface ModelPickerProps {
  modelsByProvider: Record<string, ModelEntry[]>;
  activeModel: string;
  activeProvider: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export function fuzzyFilter(query: string, items: string[]): string[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter((item) => item.toLowerCase().includes(lower));
}

export function flattenModels(
  modelsByProvider: Record<string, ModelEntry[]>,
): Array<{ model: ModelEntry; provider: string }> {
  const result: Array<{ model: ModelEntry; provider: string }> = [];
  for (const [provider, models] of Object.entries(modelsByProvider)) {
    for (const model of models) {
      result.push({ model, provider });
    }
  }
  return result;
}

export function ModelPicker({
  modelsByProvider,
  activeModel,
  activeProvider,
  onSelect,
  onCancel,
}: ModelPickerProps) {
  const allModels = flattenModels(modelsByProvider);
  const [filter, setFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = filter
    ? allModels.filter(({ model }) =>
        `${model.id} ${model.label ?? ""}`.toLowerCase().includes(filter.toLowerCase()),
      )
    : allModels;

  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));

  useInput((char, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (filtered[safeIdx]) {
        onSelect(filtered[safeIdx].model.id);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIdx((prev) => Math.min(filtered.length - 1, prev + 1));
      return;
    }

    if (key.backspace || key.delete) {
      setFilter((prev) => prev.slice(0, -1));
      setSelectedIdx(0);
      return;
    }

    if (!key.ctrl && !key.meta && !key.shift) {
      setFilter((prev) => prev + char);
      setSelectedIdx(0);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Select Model
        </Text>
        <Text color="gray"> (↑↓ navigate, Enter select, Esc cancel)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">{"> "}</Text>
        <Text>{filter}</Text>
        <Text color="gray">█</Text>
      </Box>

      {filtered.length === 0 && (
        <Box>
          <Text color="red">No models match filter</Text>
        </Box>
      )}

      {filtered.map(({ model, provider }, idx) => {
        const isSelected = idx === safeIdx;
        const isActive = model.id === activeModel && provider === activeProvider;

        return (
          <Box key={`${provider}:${model.id}`}>
            <Text color={isSelected ? "cyan" : undefined}>
              {isSelected ? "❯ " : "  "}
              {model.label ?? model.id}
              {isActive ? " (active)" : ""}
              <Text color="gray"> — {provider}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
