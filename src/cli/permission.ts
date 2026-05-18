/**
 * @license MIT
 * Module containing permission request handling and tool execution state
 */

/**
 * Tracks whether we should ask the user about tool permissions
 */
export interface PermissionState {
  /** Tools that the user has approved for this session */
  approvedTools: Set<string>;
  /** Whether we've asked the user about this specific tool */
  pendingTools: Map<string, boolean>;
}

/**
 * Represents a pending tool call that needs permission
 */
export interface PendingToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Check if a tool is a dangerous tool that requires permission
 */
export function isDangerousTool(toolName: string, dangerousTools: string[]): boolean {
  return dangerousTools.some((t) => toolName === t || toolName.startsWith(`${t}/`));
}

/**
 * Format a permission request message for the user
 */
export function formatPermissionRequest(
  toolName: string,
  input: Record<string, unknown>,
  dangerousTools: string[],
): string {
  const isDangerous = isDangerousTool(toolName, dangerousTools);
  const riskLevel = isDangerous ? "high" : "medium";

  let message = `[Permission Request] The agent wants to use "${toolName}"`;

  if (isDangerous) {
    message += `\n⚠️  This tool can write files or execute code - risk level: ${riskLevel}`;
  }

  // Truncate input for display
  const inputStr = JSON.stringify(input).slice(0, 200);
  message += `\nInput: ${inputStr}${inputStr.length >= 200 ? "..." : ""}`;

  message += "\n\nDo you want to grant permission? (yes/no)";

  return message;
}

/**
 * Format a message explaining why the agent stopped
 */
export function formatAgentStoppedMessage(deniedTools: string[], hasMoreSteps: boolean): string {
  if (deniedTools.length > 0) {
    return `\n[Agent Stopped] Permission was denied for tool(s): ${deniedTools.join(", ")}\nThe agent cannot continue without these tools.\nTo proceed, you can:\n  1. Type "/yolo" to enable YOLO mode (no restrictions)\n  2. Type "yes" to grant permission and continue\n`;
  }

  if (hasMoreSteps) {
    return "\n[Agent Stopped] The agent encountered an issue and stopped.\n";
  }

  return "";
}
