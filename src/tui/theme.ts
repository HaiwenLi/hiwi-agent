import type { MarkdownTheme } from "./components/markdown.js";

const bold = (t: string) => `\x1b[1m${t}\x1b[22m`;
const italic = (t: string) => `\x1b[3m${t}\x1b[23m`;
const dim = (t: string) => `\x1b[2m${t}\x1b[22m`;
const cyan = (t: string) => `\x1b[36m${t}\x1b[39m`;
const yellow = (t: string) => `\x1b[33m${t}\x1b[39m`;
const green = (t: string) => `\x1b[32m${t}\x1b[39m`;
const blue = (t: string) => `\x1b[34m${t}\x1b[39m`;
const gray = (t: string) => `\x1b[90m${t}\x1b[39m`;
const strikethrough = (t: string) => `\x1b[9m${t}\x1b[29m`;
const underline = (t: string) => `\x1b[4m${t}\x1b[24m`;

export const defaultMarkdownTheme: MarkdownTheme = {
	heading: (t) => bold(cyan(t)),
	link: (t) => blue(underline(t)),
	linkUrl: (t) => gray(t),
	code: (t) => yellow(t),
	codeBlock: (t) => green(t),
	codeBlockBorder: (t) => gray(t),
	quote: (t) => italic(t),
	quoteBorder: (t) => gray(t),
	hr: (t) => gray(t),
	listBullet: (t) => cyan(t),
	bold,
	italic,
	strikethrough,
	underline,
};
