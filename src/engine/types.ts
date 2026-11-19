export type Snapshot = Record<string, string>;

export interface Commit {
  id: string;
  parents: string[];
  message: string;
  author: string;
  email: string;
  time: number; // epoch seconds
  snapshot: Snapshot;
}

export interface Head {
  /** null means detached HEAD */
  branch: string | null;
  commit: string | null;
}

export interface Remote {
  name: string;
  url: string;
  /** refs/remotes/<name>/<branch> -> commit */
  tracking: Record<string, string>;
  /** the "other machine" branches */
  server: Record<string, string>;
  tags: Record<string, string>;
}

export interface StashEntry {
  message: string;
  branch: string;
  commit: string;
  snapshot: Snapshot;
  index: Snapshot;
}

export interface ReflogEntry {
  head: string | null;
  branch: string | null;
  message: string;
}

export interface MergeState {
  target: string;
  targetLabel: string;
  base: string | null;
  /** HEAD before the merge, used by --abort */
  origHead: string | null;
}

export interface RebaseState {
  onto: string;
  branch: string;
  remaining: string[];
}

export interface PresetRemote {
  branches: Record<string, string>;
  commits: Record<string, Commit>;
}

export interface Repo {
  initialized: boolean;
  dir: string;
  branch_prefix: string;
  commits: Record<string, Commit>;
  branches: Record<string, string>;
  tags: Record<string, string>;
  head: Head;
  index: Snapshot;
  workdir: Snapshot;
  remotes: Record<string, Remote>;
  stash: StashEntry[];
  reflog: ReflogEntry[];
  conflicts: string[];
  mergeState: MergeState | null;
  rebaseState: RebaseState | null;
  clock: number;
  presets: Record<string, PresetRemote>;
  config: { name: string; email: string };
}

export type LineKind = 'out' | 'err' | 'ok' | 'muted' | 'hint';

export interface OutputLine {
  kind: LineKind;
  text: string;
}

export type Zone = 'workdir' | 'index' | 'head' | 'remote' | 'graph';

export interface ExecResult {
  lines: OutputLine[];
  /** one plain-English sentence describing what just happened */
  explain?: string;
  touched: Zone[];
  error: boolean;
}

export interface Io {
  lines: OutputLine[];
  explain?: string;
  touched: Zone[];
  error: boolean;
  out(text?: string): void;
  err(text: string): void;
  ok(text: string): void;
  muted(text: string): void;
  hint(text: string): void;
  say(text: string): void;
  touch(...zones: Zone[]): void;
}

export interface FileChange {
  path: string;
  status: 'A' | 'M' | 'D';
}

export interface StatusInfo {
  branch: string | null;
  detached: boolean;
  unborn: boolean;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  conflicts: string[];
  upstream: string | null;
  ahead: number;
  behind: number;
  merging: boolean;
  rebasing: boolean;
}
