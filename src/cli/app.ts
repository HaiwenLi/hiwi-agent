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

	// Loader for animated thinking indicator
	private loader: Loader | null = null;

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
		const separator = `\x1b[90m${"─".repeat(width)}\x1b[0m`;

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
		if (this.popupVisible) {
			result.push(...this.renderPopup(width));
		}

		// Input line
		const prompt = "\x1b[34m> \x1b[0m";
		const promptWidth = 2;
		const inputWidth = width - promptWidth;
		const displayInput = truncateToWidth(this.input, inputWidth);
		result.push(`${prompt}${displayInput}\x1b[90m█\x1b[0m`);

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

		const visible = filtered.slice(0, POPOUP_MAX_VISIBLE);
		const lines: string[] = [];

		for (let i = 0; i < visible.length; i++) {
			const cmd = visible[i];
			const selected = i === this.popupIndex;
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
			lines.push(`\x1b[90m   ... +${filtered.length - POPOUP_MAX_VISIBLE} more\x1b[0m`);
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

		const cachePart = d.cacheReadTokens != null && d.cacheReadTokens > 0
			? ` \x1b[32m\x1b[2mcache${formatTokens(d.cacheReadTokens)}\x1b[0m`
			: "";

		const left = `\x1b[${contextColor}m↑${formatTokens(d.inputTokens)} ↓${formatTokens(d.outputTokens)}${cachePart} ${contextStr}/${formatTokens(d.contextWindow ?? 200000)}\x1b[0m`;
		const effort = d.thinkingEffort ?? "high";
		const right = `${d.provider} ${d.modelName} \x1b[90m[\x1b[37m${effort}\x1b[90m]\x1b[0m`;
		const leftWidth = visibleWidth(left);
		const rightWidth = visibleWidth(right);
		const padding = Math.max(1, width - leftWidth - rightWidth);
		return `${left}${" ".repeat(padding)}${right}`;
	}

  handleInput(data: string): void {
    if (isKeyRelease(data)) return;

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
				this.requestRender();
				return;
			}
			if (matchesKey(data, Key.down)) {
				const filtered = this.getFilteredCommands();
				this.popupIndex = Math.min(Math.min(filtered.length, POPOUP_MAX_VISIBLE) - 1, this.popupIndex + 1);
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
			this.popupVisible = filtered.length > 0;
			if (this.popupVisible) {
				this.popupIndex = Math.min(this.popupIndex, Math.min(filtered.length, POPOUP_MAX_VISIBLE) - 1);
			}
		} else {
			this.popupVisible = false;
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
	};

	// Pause request: ESC → ChatComponent → AppHandle.onPauseRequest
	handle.onPauseRequest = () => {
		chat.onPause();
		callbacks.onPauseRequest?.();
	};

	return handle;
}
