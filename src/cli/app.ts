import { ProcessTerminal, TUI, type Component, Loader, Text } from "../tui/index.js";
import { decodePrintableKey, isKeyRelease, matchesKey, Key } from "../tui/keys.js";
import { Markdown, type MarkdownTheme } from "../tui/components/markdown.js";
import { defaultMarkdownTheme } from "../tui/theme.js";
import { visibleWidth, wrapTextWithAnsi, truncateToWidth } from "../tui/utils.js";
import type { TokenUsage } from "../types.js";

export interface OutputLine {
	id: number;
	text: string;
	role: "user" | "assistant" | "tool" | "system" | "error" | "thinking";
}

export interface SlashCommand {
	name: string;
	description: string;
}

export interface AppCallbacks {
  onInput: (text: string) => Promise<void>;
  fetchCommands?: () => Promise<SlashCommand[]>;
  onPauseRequest?: () => void;
}

/** A single item shown in a picker popup */
export interface PickerItem {
  /** Display label (e.g. "claude-sonnet-4-6") */
  label: string;
  /** Secondary info shown after label (e.g. "anthropic") */
  detail?: string;
  /** The value to pass to onInput when selected (e.g. "/model claude-sonnet-4-6") */
  value: string;
}

const MAX_LINES = 500;
const THINKING_PREVIEW_LINES = 3;
const THINKING_MAX_FOLDED = 6;
const OUTPUT_FOLD_LINES = 50;
const OUTPUT_FOLD_PREVIEW = 15;
const POPOUP_MAX_VISIBLE = 8;

const ROLE_STYLES: Record<string, (text: string) => string> = {
	user: (t) => `\x1b[36m${t}\x1b[0m`,
	tool: (t) => `\x1b[33m${t}\x1b[0m`,
	system: (t) => `\x1b[37m${t}\x1b[0m`,
	error: (t) => `\x1b[31m${t}\x1b[0m`,
};

function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
	return `${Math.round(n / 1000)}k`;
}

class ChatComponent implements Component {
	wantsKeyRelease = false;
	private lines: OutputLine[] = [];
	private input = "";
	private processing = false;
	private streamingText = "";
	private thinkingBuffer = "";
	private showThinking = false;
	private showFullOutputs = new Set<number>();
	private statusData: TokenUsage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		contextPercent: null,
		contextWindow: 200000,
		modelName: "",
		provider: "",
	};
	private callbacks: AppCallbacks;
	private nextId = 0;
	private tui: TUI | null = null;
	private exitResolve: (() => void) | null = null;
	private mdTheme: MarkdownTheme;

	// Slash command popup state
	private allCommands: SlashCommand[] = [];
	private popupVisible = false;
	private popupIndex = 0;
	private popupScrollOffset = 0;

	// Picker popup state (model/provider selection)
	private pickerItems: PickerItem[] = [];
	private pickerVisible = false;
	private pickerIndex = 0;
	private pickerScrollOffset = 0;

	// Loader for animated thinking indicator
	private loader: Loader | null = null;

	// Inline prompt state (for API key input etc.)
	private awaitingInput = false;
	private promptLabel = "";
	private pendingInputResolve: ((value: string) => void) | null = null;

	constructor(callbacks: AppCallbacks) {
		this.callbacks = callbacks;
		this.mdTheme = defaultMarkdownTheme;
		callbacks.fetchCommands?.().then((cmds) => {
			this.allCommands = cmds;
		});
	}

	setTUI(tui: TUI): void {
		this.tui = tui;
		this.loader = new Loader(
			tui,
			(s) => `\x1b[90m${s}\x1b[0m`,
			(s) => `\x1b[90m${s}\x1b[0m`,
			"Thinking...",
		);
	}

	setExitResolve(resolve: () => void): void {
		this.exitResolve = resolve;
	}

	render(width: number): string[] {
		const result: string[] = [];
		const separator = `\x1b[37m${"─".repeat(width)}\x1b[0m`;

		// Output lines
		for (const line of this.lines) {
			if (line.role === "assistant") {
				const md = new Markdown(line.text, 0, 0, this.mdTheme);
				const mdLines = md.render(width);
				if (mdLines.length > OUTPUT_FOLD_LINES && !this.showFullOutputs.has(line.id)) {
					result.push(...mdLines.slice(0, OUTPUT_FOLD_PREVIEW));
					const remaining = mdLines.length - OUTPUT_FOLD_PREVIEW;
					result.push(`\x1b[90m\x1b[2m  ═══ ${remaining} more lines (Ctrl+O to expand) ═══\x1b[0m`);
				} else {
					result.push(...mdLines);
				}
			} else if (line.role === "thinking") {
				result.push(...this.renderThinking(line.text, width));
			} else {
				const styler = ROLE_STYLES[line.role] ?? ROLE_STYLES.system;
				const wrapped = wrapTextWithAnsi(styler(line.text), width);
				result.push(...wrapped);
			}
		}

		// Streaming text (markdown rendered)
		if (this.streamingText) {
			const md = new Markdown(this.streamingText, 0, 0, this.mdTheme);
			result.push(...md.render(width));
		}

		// Processing indicator (uses Loader component for animated spinner)
		if (this.processing && !this.streamingText && this.loader) {
			result.push(...this.loader.render(width));
		}

		// Top separator
		result.push(separator);

		// Popup (rendered above input line)
		if (this.pickerVisible) {
			result.push(...this.renderPicker(width));
		} else if (this.popupVisible) {
			result.push(...this.renderPopup(width));
		}

		// Input line
		const prompt = this.awaitingInput ? `\x1b[33m${this.promptLabel}\x1b[0m` : "\x1b[34m> \x1b[0m";
		const promptWidth = visibleWidth(prompt.replace(/\x1b\[[0-9;]*m/g, ""));
		const inputWidth = width - promptWidth;
		const displayInput = truncateToWidth(this.input, inputWidth);
		result.push(`${prompt}${displayInput}\x1b[37m█\x1b[0m`);

		// Bottom separator
		result.push(separator);

		// Current directory
		result.push(`\x1b[36m${truncateToWidth(process.cwd(), width)}\x1b[0m`);

		// Status bar
		result.push(this.renderStatusBar(width));

		return result;
	}

	private getFilteredCommands(): SlashCommand[] {
		if (!this.input.startsWith("/")) return [];
		const query = this.input.slice(1).toLowerCase();
		if (!query) return this.allCommands;
		return this.allCommands.filter((c) => c.name.toLowerCase().startsWith(query));
	}

	private renderPopup(width: number): string[] {
		const filtered = this.getFilteredCommands();
		if (filtered.length === 0) return [];

		const offset = this.popupScrollOffset;
		const visible = filtered.slice(offset, offset + POPOUP_MAX_VISIBLE);
		const lines: string[] = [];

		for (let i = 0; i < visible.length; i++) {
			const cmd = visible[i];
			const selected = i + offset === this.popupIndex;
			const nameCol = cmd.name.padEnd(14);
			const content = `/${nameCol} ${cmd.description}`;
			if (selected) {
				const line = `\x1b[44;37m ${truncateToWidth(content, width - 2)} \x1b[0m`;
				lines.push(line + " ".repeat(Math.max(0, width - visibleWidth(line))));
			} else {
				lines.push(`\x1b[90m ${truncateToWidth(content, width - 2)} \x1b[0m`);
			}
		}

		if (filtered.length > POPOUP_MAX_VISIBLE) {
			const hiddenAbove = offset;
			const hiddenBelow = filtered.length - offset - visible.length;
			let hint = "";
			if (hiddenAbove > 0) hint += `↑${hiddenAbove} `;
			if (hiddenBelow > 0) hint += `↓${hiddenBelow}`;
			if (hint) lines.push(`\x1b[90m   ${hint}\x1b[0m`);
		}

		return lines;
	}

	private renderThinking(text: string, width: number): string[] {
		const lines = text.split("\n");
		const isFolded = !this.showThinking && lines.length > THINKING_MAX_FOLDED;

		if (isFolded) {
			const preview = lines.slice(0, THINKING_PREVIEW_LINES);
			const remaining = lines.length - THINKING_PREVIEW_LINES;
			const result: string[] = [];
			result.push(`\x1b[90m\x1b[3m  Thinking (${remaining} more lines, Ctrl+O to expand)\x1b[0m`);
			for (const line of preview) {
				result.push(`\x1b[90m\x1b[3m  ${truncateToWidth(line, width - 2)}\x1b[0m`);
			}
			return result;
		}

		const result: string[] = [];
		result.push("\x1b[90m\x1b[3m  Thinking:\x1b[0m");
		for (const line of lines) {
			result.push(`\x1b[90m\x1b[3m  ${truncateToWidth(line, width - 2)}\x1b[0m`);
		}
		result.push(`\x1b[90m\x1b[3m  (${lines.length} lines, Ctrl+O to collapse)\x1b[0m`);
		return result;
	}

	private renderStatusBar(width: number): string {
		const d = this.statusData;
		const contextStr = d.contextPercent != null ? `${d.contextPercent.toFixed(1)}%` : "?";
		let contextColor = "37";
		if (d.contextPercent != null) {
			if (d.contextPercent > 90) contextColor = "31";
			else if (d.contextPercent > 70) contextColor = "33";
		}

		const cacheReadPart = d.cacheReadTokens != null && d.cacheReadTokens > 0
			? ` \x1b[32m\x1b[2m↗${formatTokens(d.cacheReadTokens)}\x1b[0m`
			: "";
		const cacheWritePart = d.cacheWriteTokens != null && d.cacheWriteTokens > 0
			? ` \x1b[33m\x1b[2m↘${formatTokens(d.cacheWriteTokens)}\x1b[0m`
			: "";

		const left = `\x1b[${contextColor}m↑${formatTokens(d.inputTokens)} ↓${formatTokens(d.outputTokens)}${cacheReadPart}${cacheWritePart} ${contextStr}/${formatTokens(d.contextWindow ?? 200000)}\x1b[0m`;
		const effort = d.thinkingEffort ?? "high";
		const right = `${d.provider} ${d.modelName} \x1b[90m[\x1b[37m${effort}\x1b[90m]\x1b[0m`;
		const leftWidth = visibleWidth(left);
		const rightWidth = visibleWidth(right);
		const padding = Math.max(1, width - leftWidth - rightWidth);
		return `${left}${" ".repeat(padding)}${right}`;
	}

  handleInput(data: string): void {
    if (isKeyRelease(data)) return;

    // Picker mode takes priority over all other input
    if (this.pickerVisible) {
      if (matchesKey(data, Key.up)) {
        this.pickerIndex = Math.max(0, this.pickerIndex - 1);
        this.pickerScrollOffset = Math.min(this.pickerScrollOffset, this.pickerIndex);
        this.requestRender();
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.pickerIndex = Math.min(
          this.filteredPickerItems.length - 1,
          this.pickerIndex + 1,
        );
        this.pickerScrollOffset = Math.max(
          this.pickerScrollOffset,
          this.pickerIndex - POPOUP_MAX_VISIBLE + 1,
        );
        this.requestRender();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        const item = this.filteredPickerItems[this.pickerIndex];
        if (item) {
          this.pickerVisible = false;
          this.pickerItems = [];
          this.input = "";
          this.requestRender();
          this.submitPickerItem(item);
        }
        return;
      }
      if (matchesKey(data, Key.escape)) {
        this.pickerVisible = false;
        this.pickerItems = [];
        this.input = "";
        this.requestRender();
        return;
      }
      // Filter picker items by typed characters
      const printable = decodePrintableKey(data) ?? this.decodeRawPrintable(data);
      if (printable) {
        this.input += printable;
        this.updatePickerFilter();
        this.requestRender();
      } else if (matchesKey(data, Key.backspace)) {
        this.input = this.input.slice(0, -1);
        this.updatePickerFilter();
        this.requestRender();
      }
      return;
    }

    // ESC during processing → pause the agent
    if (this.processing && matchesKey(data, Key.escape)) {
      this.callbacks.onPauseRequest?.();
      this.addOutput("[Pausing...]", "system");
      return;
    }

    // Popup navigation
    if (this.popupVisible) {
			if (matchesKey(data, Key.up)) {
				this.popupIndex = Math.max(0, this.popupIndex - 1);
				this.popupScrollOffset = Math.min(this.popupScrollOffset, this.popupIndex);
				this.requestRender();
				return;
			}
			if (matchesKey(data, Key.down)) {
				const filtered = this.getFilteredCommands();
				this.popupIndex = Math.min(filtered.length - 1, this.popupIndex + 1);
				this.popupScrollOffset = Math.max(this.popupScrollOffset, this.popupIndex - POPOUP_MAX_VISIBLE + 1);
				this.requestRender();
				return;
			}
			if (matchesKey(data, Key.tab) || matchesKey(data, Key.enter)) {
				const filtered = this.getFilteredCommands();
				const cmd = filtered[this.popupIndex];
				if (cmd) {
					this.input = `/${cmd.name} `;
				}
				this.popupVisible = false;
				this.requestRender();
				if (matchesKey(data, Key.enter)) {
					// Immediately submit
					this.submitInput();
				}
				return;
			}
			if (matchesKey(data, Key.escape)) {
				this.popupVisible = false;
				this.requestRender();
				return;
			}
			// Fall through: printable chars modify input and update popup
		}

		if (!this.popupVisible && matchesKey(data, Key.ctrl("o"))) {
			let handled = false;
			// Expand most recent folded assistant output first
			for (let i = this.lines.length - 1; i >= 0; i--) {
				const line = this.lines[i];
				if (line.role === "assistant" && !this.showFullOutputs.has(line.id)) {
					const md = new Markdown(line.text, 0, 0, this.mdTheme);
					// Estimate: if text has many lines, it qualifies for folding
					const hardLineCount = line.text.split("\n").length;
				if (hardLineCount > OUTPUT_FOLD_LINES / 3) {
					this.showFullOutputs.add(line.id);
						handled = true;
						break;
					}
				}
			}
			if (!handled) {
				this.showThinking = !this.showThinking;
			}
			this.requestRender();
			return;
		}

		if (matchesKey(data, Key.enter)) {
			this.submitInput();
			return;
		}

		if (matchesKey(data, Key.ctrl("c"))) {
			this.loader?.stop();
			if (this.tui) this.tui.stop();
			this.exitResolve?.();
			process.exit(0);
		}

		if (matchesKey(data, Key.backspace)) {
			this.input = this.input.slice(0, -1);
			this.updatePopupState();
			this.requestRender();
			return;
		}

		const printable = decodePrintableKey(data) ?? this.decodeRawPrintable(data);
		if (printable) {
			this.input += printable;
			this.updatePopupState();
			this.requestRender();
		}
	}

  private submitInput(): void {
    const text = this.input;

    // If awaiting inline input (e.g. API key), resolve the promise
    // even for empty input (user pressing Enter to cancel)
    if (this.awaitingInput && this.pendingInputResolve) {
      this.input = "";
      this.awaitingInput = false;
      this.promptLabel = "";
      const resolve = this.pendingInputResolve;
      this.pendingInputResolve = null;
      this.requestRender();
      resolve(text);
      return;
    }

    if (!text.trim()) return;

    this.popupVisible = false;
    this.pushLine(text, "user");
    this.input = "";
    this.processing = true;
    this.loader?.start();
    this.requestRender();
    this.callbacks.onInput(text).then(() => {
      this.processing = false;
      this.loader?.stop();
      this.requestRender();
    }).catch(() => {
      this.processing = false;
      this.loader?.stop();
      this.requestRender();
    });
  }

  /** Called externally when agent paused — resets UI state */
  onPause(): void {
    this.processing = false;
    this.loader?.stop();
    this.requestRender();
  }

	private updatePopupState(): void {
		if (this.input.startsWith("/")) {
			const filtered = this.getFilteredCommands();
			if (filtered.length > 0) {
				this.popupScrollOffset = 0;
				this.popupVisible = true;
				this.popupIndex = Math.min(this.popupIndex, Math.min(filtered.length, POPOUP_MAX_VISIBLE) - 1);
			} else {
				this.popupVisible = false;
				this.popupIndex = 0;
			}
		} else {
			this.popupVisible = false;
			this.popupIndex = 0;
		}
	}

	invalidate(): void {}

	addOutput(text: string, role: OutputLine["role"] = "assistant"): void {
		this.pushLine(text, role);
		this.requestRender();
	}

	addStreamChunk(chunk: string): void {
		this.streamingText += chunk;
		this.requestRender();
	}

	endStream(): void {
		if (this.streamingText) {
			this.pushLine(this.streamingText, "assistant");
			this.streamingText = "";
		}
		this.requestRender();
	}

	addThinkingChunk(chunk: string): void {
		this.thinkingBuffer += chunk;
	}

	endThinking(): void {
		if (this.thinkingBuffer) {
			this.pushLine(this.thinkingBuffer, "thinking");
			this.thinkingBuffer = "";
		}
		this.requestRender();
	}

	setStatusBarData(data: TokenUsage): void {
		this.statusData = data;
		this.requestRender();
	}

	// Public cleanup for exit — stops animations and releases terminal
	stopAll(): void {
		this.loader?.stop();
	}

	/** Prompt for inline input (e.g. API key). Returns the user's input. */
	promptInput(label: string): Promise<string> {
		return new Promise<string>((resolve) => {
			this.awaitingInput = true;
			this.promptLabel = label;
			this.pendingInputResolve = resolve;
			this.input = "";
			this.requestRender();
		});
	}

	/** Show a picker popup with the given items. */
	showPicker(items: PickerItem[]): void {
		this.pickerItems = items;
		this.filteredPickerItems = items;
		this.pickerIndex = 0;
		this.pickerScrollOffset = 0;
		this.pickerVisible = items.length > 0;
		this.input = "";
		this.requestRender();
	}

	private filteredPickerItems: PickerItem[] = [];

	private updatePickerFilter(): void {
		const query = this.input.toLowerCase();
		this.filteredPickerItems = query
			? this.pickerItems.filter(
				(item) =>
					item.label.toLowerCase().includes(query) ||
					(item.detail?.toLowerCase().includes(query) ?? false),
			)
			: this.pickerItems;
		this.pickerIndex = Math.min(this.pickerIndex, Math.max(0, this.filteredPickerItems.length - 1));
		this.pickerScrollOffset = Math.min(this.pickerScrollOffset, Math.max(0, this.filteredPickerItems.length - POPOUP_MAX_VISIBLE));
	}

	private renderPicker(width: number): string[] {
		const items = this.filteredPickerItems;
		if (items.length === 0) return ["[90m  No matches (Esc to cancel)[0m"];

		const offset = this.pickerScrollOffset;
		const visible = items.slice(offset, offset + POPOUP_MAX_VISIBLE);
		const lines: string[] = [];

		for (let i = 0; i < visible.length; i++) {
			const item = visible[i];
			const selected = i + offset === this.pickerIndex;
			const labelCol = item.label.padEnd(24);
			const detail = item.detail ? ` ${item.detail}` : "";
			const content = `${labelCol}${detail}`;
			if (selected) {
				const line = `[44;37m ${truncateToWidth(content, width - 2)} [0m`;
				lines.push(line + " ".repeat(Math.max(0, width - visibleWidth(line))));
			} else {
				lines.push(`[90m ${truncateToWidth(content, width - 2)} [0m`);
			}
		}

		if (items.length > POPOUP_MAX_VISIBLE) {
			lines.push(`[90m   ... +${items.length - POPOUP_MAX_VISIBLE} more[0m`);
		}

		if (this.input) {
			lines.push(`[90m  Filter: ${this.input}[0m`);
		} else {
			lines.push(`[90m  Type to filter, Enter to select, Esc to cancel[0m`);
		}

		return lines;
	}

	private submitPickerItem(item: PickerItem): void {
		// Don't set processing=true or start the loader here — picker items
		// are slash commands (/model, /provider) that may need to prompt for
		// input (e.g. API key). The loader would obscure the prompt.
		this.callbacks.onInput(item.value).then(() => {
			this.requestRender();
		}).catch(() => {
			this.requestRender();
		});
	}

	private pushLine(text: string, role: OutputLine["role"]): void {
		this.lines.push({ id: this.nextId++, text, role });
		if (this.lines.length > MAX_LINES) {
			this.lines = this.lines.slice(this.lines.length - MAX_LINES);
		}
	}

	private requestRender(): void {
		this.tui?.requestRender();
	}

	private decodeRawPrintable(data: string): string | undefined {
		if (data.length !== 1) return undefined;
		const cp = data.codePointAt(0)!;
		if (cp < 32 || cp === 127) return undefined;
		return data;
	}
}

export interface AppHandle {
  addOutput: (text: string, role?: OutputLine["role"]) => void;
  addStreamChunk: (chunk: string) => void;
  endStream: () => void;
  addThinkingChunk: (chunk: string) => void;
  endThinking: () => void;
  setStatusBarData: (data: TokenUsage) => void;
  destroy: () => void;
  waitUntilExit: () => Promise<void>;
  /** Called when ESC is pressed during agent processing */
  onPauseRequest?: () => void;
  /** Show an interactive picker popup */
  showPicker: (items: PickerItem[]) => void;
  /** Prompt for inline input (returns the entered string) */
  promptInput: (label: string) => Promise<string>;
}

export function createApp(callbacks: AppCallbacks): AppHandle {
	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);
	const chat = new ChatComponent(callbacks);
	chat.setTUI(tui);
	tui.addChild(chat);
	tui.setFocus(chat);
	tui.start();

	const exitPromise = new Promise<void>((resolve) => {
		chat.setExitResolve(resolve);
	});

	const handle: AppHandle = {
		addOutput: (text, role) => chat.addOutput(text, role),
		addStreamChunk: (chunk) => chat.addStreamChunk(chunk),
		endStream: () => chat.endStream(),
		addThinkingChunk: (chunk) => chat.addThinkingChunk(chunk),
		endThinking: () => chat.endThinking(),
		setStatusBarData: (data) => chat.setStatusBarData(data),
		destroy: () => {
			chat.stopAll();
			tui.stop();
		},
			waitUntilExit: () => exitPromise,
			showPicker: (items) => chat.showPicker(items),
		promptInput: (label) => chat.promptInput(label),
		};

	// Pause request: ESC → ChatComponent → AppHandle.onPauseRequest
	handle.onPauseRequest = () => {
		chat.onPause();
		callbacks.onPauseRequest?.();
	};

	return handle;
}
