// ─── LSP Base Types ────────────────────────────────────────────

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Symbol {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

export interface DocumentSymbol {
  name: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface HoverResult {
  contents: { kind: string; value: string } | string;
  range?: Range;
}

export interface ServerConfig {
  command: string;
  args: string[];
  extensions: string[];
}
