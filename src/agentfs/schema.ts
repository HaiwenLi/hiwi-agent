// ─── Mode constants (POSIX-style inode types) ─────────────────────

export const S_IFMT = 0o170000;
export const S_IFREG = 0o100000;
export const S_IFDIR = 0o040000;
export const S_IFLNK = 0o120000;
export const DEFAULT_FILE_MODE = 0o100644;
export const DEFAULT_DIR_MODE = 0o040755;
export const DEFAULT_CHUNK_SIZE = 4096;
