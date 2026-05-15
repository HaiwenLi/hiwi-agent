export interface AddFileHunk {
  type: "add";
  path: string;
  lines: string[];
}

export interface DeleteFileHunk {
  type: "delete";
  path: string;
}

export interface UpdateChunk {
  context: string[];
  oldLines: string[];
  newLines: string[];
}

export interface UpdateFileHunk {
  type: "update";
  path: string;
  moveTo?: string;
  chunks: UpdateChunk[];
}

export type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;
