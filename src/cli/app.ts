import { ProcessTerminal, TUI, type Component } from "../tui/index.js";
import { decodePrintableKey, isKeyRelease, matchesKey, Key } from "../tui/keys.js";
import { visibleWidth, wrapTextWithAnsi, truncateToWidth } from "../tui/utils.js";
import type { TokenUsage } from "../types.js";

export interface OutputLine {
	id: number;
	text: string;
	role: "user" | "assistant" | "tool" | "system" | "error" | "thinking";
}

export interface AppCallbacks {
	onInput: (text: string) => Promise<void>;
	fetchCommands?: () => Promise<{ name: string; description: string }[]>;
}

const MAX_LINES = 500;

const ROLE_COLORS: Record<string, string> = {
	user: "36", // cyan
	assistant: "32", // green
	tool: "33", // yellow
	system: "37", // white
	error: "31", // red
	thinking: "90", // gray
};

function colorize(text: string, role: string): string {
	const code = ROLE_COLORS[role] ?? "37";
	return `\x1b[${code}m${text}\x1b[0m`;
}

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

	constructor(callbacks: AppCallbacks) {
		this.callbacks = callbacks;
	}

	setTUI(tui: TUI): void {
		this.tui = tui;
	}

	setExitResolve(resolve: () => void): void {
		this.exitResolve = resolve;
	}

	render(width: number): string[] {
		const result: string[] = [];

		// Output lines
		for (const line of this.lines) {
			const colored = colorize(line.text, line.role);
			const wrapped = wrapTextWithAnsi(colored, width);
			result.push(...wrapped);
		}

		// Streaming text
		if (this.streamingText) {
			const colored = colorize(this.streamingText, "assistant");
			const wrapped = wrapTextWithAnsi(colored, width);
			result.push(...wrapped);
		}

		// Processing indicator (no streaming text yet)
		if (this.processing && !this.streamingText) {
			result.push(colorize("Thinking...", "thinking"));
		}

		// Separator
		result.push(`\x1b[90m${"─".repeat(width)}\x1b[0m`);

		// Status bar
		result.push(this.renderStatusBar(width));

		// Input line
		const prompt = "\x1b[34m> \x1b[0m";
		const promptWidth = 2;
		const inputWidth = width - promptWidth;
		const displayInput = truncateToWidth(this.input, inputWidth);
		result.push(`${prompt}${displayInput}\x1b[90m█\x1b[0m`);

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

		const left = `\x1b[${contextColor}m↑${formatTokens(d.inputTokens)} ↓${formatTokens(d.outputTokens)}  ${contextStr}/${formatTokens(d.contextWindow ?? 200000)}\x1b[0m`;
		const right = `${d.provider} ${d.modelName}`;
		const leftWidth = visibleWidth(left);
		const rightWidth = visibleWidth(right);
		const padding = Math.max(1, width - leftWidth - rightWidth);
		return `${left}${" ".repeat(padding)}\x1b[37m${right}\x1b[0m`;
	}

	handleInput(data: string): void {
		if (isKeyRelease(data)) return;

		if (matchesKey(data, Key.enter)) {
			const text = this.input;
			if (!text.trim()) return;
			this.pushLine(text, "user");
			this.input = "";
			this.processing = true;
			this.requestRender();
			this.callbacks.onInput(text).then(() => {
				this.processing = false;
				this.requestRender();
			});
			return;
		}

		if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.escape)) {
			if (this.tui) this.tui.stop();
			this.exitResolve?.();
			process.exit(0);
		}

		if (matchesKey(data, Key.backspace)) {
			this.input = this.input.slice(0, -1);
			this.requestRender();
			return;
		}

		const printable = decodePrintableKey(data);
		if (printable) {
			this.input += printable;
			this.requestRender();
		}
	}

	invalidate(): void {}

	// Public API for external state mutation

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
		// Don't render thinking in real-time to reduce noise
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

	private pushLine(text: string, role: OutputLine["role"]): void {
		this.lines.push({ id: this.nextId++, text, role });
		if (this.lines.length > MAX_LINES) {
			this.lines = this.lines.slice(this.lines.length - MAX_LINES);
		}
	}

	private requestRender(): void {
		this.tui?.requestRender();
	}
}

export interface AppHandle {
	addOutput: (text: string, role?: OutputLine["role"]) => void;
	addStreamChunk: (chunk: string) => void;
	endStream: () => void;
	addThinkingChunk: (chunk: string) => void;
	endThinking: () => void;
	setStatusBarData: (data: TokenUsage) => void;
	waitUntilExit: () => Promise<void>;
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

	return {
		addOutput: (text, role) => chat.addOutput(text, role),
		addStreamChunk: (chunk) => chat.addStreamChunk(chunk),
		endStream: () => chat.endStream(),
		addThinkingChunk: (chunk) => chat.addThinkingChunk(chunk),
		endThinking: () => chat.endThinking(),
		setStatusBarData: (data) => chat.setStatusBarData(data),
		waitUntilExit: () => exitPromise,
	};
}
