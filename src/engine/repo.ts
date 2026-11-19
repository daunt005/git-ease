import type {
  Commit,
  FileChange,
  ReflogEntry,
  Repo,
  Snapshot,
  StatusInfo,
} from './types.ts';
import { hashId, isIgnored, unionPaths } from './util.ts';

const EPOCH = 1763000000; // a fixed "today" so labs are deterministic

export function createRepo(): Repo {
  return {
    initialized: false,
    dir: '~/project',
    branch_prefix: '',
    commits: {},
    branches: {},
    tags: {},
    head: { branch: 'main', commit: null },
    index: {},
    workdir: {},
    remotes: {},
    stash: [],
    reflog: [],
    conflicts: [],
    mergeState: null,
    rebaseState: null,
    clock: EPOCH,
    presets: {},
    config: { name: 'You', email: 'you@example.com' },
  };
}

export function headCommit(repo: Repo): Commit | null {
  return repo.head.commit ? (repo.commits[repo.head.commit] ?? null) : null;
}

export function headSnapshot(repo: Repo): Snapshot {
  return headCommit(repo)?.snapshot ?? {};
}

export function snapshotOf(repo: Repo, sha: string | null): Snapshot {
  return sha ? (repo.commits[sha]?.snapshot ?? {}) : {};
}

export function createCommit(
  repo: Repo,
  message: string,
  snapshot: Snapshot,
  parents: string[],
  author = repo.config.name,
): Commit {
  repo.clock += 60;
  const id = hashId(
    JSON.stringify([parents, message, snapshot, repo.clock, author, Object.keys(snapshot).length]),
  );
  const commit: Commit = {
    id,
    parents,
    message,
    author,
    email: repo.config.email,
    time: repo.clock,
    snapshot: { ...snapshot },
  };
  repo.commits[id] = commit;
  return commit;
}

export function recordReflog(repo: Repo, message: string): void {
  const entry: ReflogEntry = {
    head: repo.head.commit,
    branch: repo.head.branch,
    message,
  };
  repo.reflog.unshift(entry);
  if (repo.reflog.length > 100) repo.reflog.length = 100;
}

/** Create a commit from the index and move HEAD to it. */
export function commitToHead(
  repo: Repo,
  message: string,
  extraParents: string[] = [],
  snapshot: Snapshot = repo.index,
): Commit {
  const parents = repo.head.commit ? [repo.head.commit, ...extraParents] : extraParents;
  const commit = createCommit(repo, message, snapshot, parents);
  if (repo.head.branch) repo.branches[repo.head.branch] = commit.id;
  repo.head.commit = commit.id;
  recordReflog(repo, `commit: ${message.split('\n')[0]}`);
  return commit;
}

export function switchBranch(repo: Repo, name: string): void {
  repo.head = { branch: name, commit: repo.branches[name] ?? null };
}

export function detachHead(repo: Repo, sha: string): void {
  repo.head = { branch: null, commit: sha };
}

export function ancestors(repo: Repo, sha: string, acc = new Set<string>()): Set<string> {
  const stack = [sha];
  while (stack.length) {
    const id = stack.pop() as string;
    if (acc.has(id)) continue;
    const commit = repo.commits[id];
    if (!commit) continue;
    acc.add(id);
    for (const parent of commit.parents) if (!acc.has(parent)) stack.push(parent);
  }
  return acc;
}

export function isAncestor(repo: Repo, maybeAncestor: string, sha: string): boolean {
  if (maybeAncestor === sha) return true;
  return ancestors(repo, sha).has(maybeAncestor);
}

export function mergeBase(repo: Repo, a: string, b: string): string | null {
  if (isAncestor(repo, a, b)) return a;
  if (isAncestor(repo, b, a)) return b;
  const ancA = ancestors(repo, a);
  const common = [...ancestors(repo, b)].filter((id) => ancA.has(id));
  common.sort((x, y) => (repo.commits[y]?.time ?? 0) - (repo.commits[x]?.time ?? 0));
  return common[0] ?? null;
}

export function aheadBehind(repo: Repo, local: string, remote: string): { ahead: number; behind: number } {
  const localSet = ancestors(repo, local);
  const remoteSet = ancestors(repo, remote);
  let ahead = 0;
  let behind = 0;
  for (const id of localSet) if (!remoteSet.has(id)) ahead++;
  for (const id of remoteSet) if (!localSet.has(id)) behind++;
  return { ahead, behind };
}

export function resolveRef(repo: Repo, ref: string): string | null {
  if (!ref) return null;
  let base = ref;
  let suffix = '';
  const idx = ref.search(/[~^]/);
  if (idx > 0) {
    base = ref.slice(0, idx);
    suffix = ref.slice(idx);
  } else if (idx === 0) {
    base = 'HEAD';
    suffix = ref;
  }

  let sha: string | null = null;
  if (base === 'HEAD' || base === '@' || base === '') sha = repo.head.commit;
  else if (base.startsWith('refs/heads/')) sha = repo.branches[base.slice(11)] ?? null;
  else if (base.startsWith('refs/tags/')) sha = repo.tags[base.slice(10)] ?? null;
  else if (base.startsWith('refs/remotes/')) {
    const rest = base.slice(13);
    const slash = rest.indexOf('/');
    if (slash > 0) {
      const remote = repo.remotes[rest.slice(0, slash)];
      sha = remote?.tracking[rest.slice(slash + 1)] ?? null;
    }
  } else if (base in repo.branches) sha = repo.branches[base];
  else if (base in repo.tags) sha = repo.tags[base];
  else if (base in repo.commits) sha = base;
  else {
    const slash = base.indexOf('/');
    if (slash > 0) {
      const remote = repo.remotes[base.slice(0, slash)];
      if (remote?.tracking[base.slice(slash + 1)]) {
        sha = remote.tracking[base.slice(slash + 1)];
      }
    }
  }

  if (!sha) {
    const matches = Object.keys(repo.commits).filter((id) => id.startsWith(base));
    if (matches.length === 1) sha = matches[0];
  }
  if (!sha) return null;
  let current: string = sha;

  for (const op of suffix.match(/[~^]\d*/g) ?? []) {
    const n = op.length > 1 ? Number(op.slice(1) || '1') : 1;
    const commit = repo.commits[current];
    if (!commit) return null;
    if (op[0] === '~') {
      for (let i = 0; i < n; i++) {
        const parent: string | undefined = repo.commits[current]?.parents[0];
        if (!parent) return null;
        current = parent;
      }
    } else {
      const parent: string | undefined = commit.parents[n - 1];
      if (!parent) return null;
      current = parent;
    }
  }
  return current;
}

export function upstreamOf(repo: Repo, branch: string | null): { remote: string; branch: string; sha: string } | null {
  if (!branch) return null;
  for (const remote of Object.values(repo.remotes)) {
    const sha = remote.tracking[branch];
    if (sha) return { remote: remote.name, branch, sha };
  }
  return null;
}

export function statusOf(repo: Repo): StatusInfo {
  const head = headSnapshot(repo);
  const staged: FileChange[] = [];
  const unstaged: FileChange[] = [];
  const untracked: string[] = [];
  const conflicts = new Set(repo.conflicts);

  for (const path of unionPaths(head, repo.index, repo.workdir)) {
    if (conflicts.has(path)) continue;
    const h = head[path];
    const i = repo.index[path];
    const w = repo.workdir[path];
    const tracked = h !== undefined || i !== undefined;

    if (!tracked) {
      if (!isIgnored(repo, path)) untracked.push(path);
      continue;
    }
    if (i !== h) {
      staged.push({ path, status: h === undefined ? 'A' : i === undefined ? 'D' : 'M' });
    }
    if (w !== i) {
      unstaged.push({ path, status: w === undefined ? 'D' : i === undefined ? 'A' : 'M' });
    }
  }

  const branch = repo.head.branch;
  const upstream = upstreamOf(repo, branch);
  let ahead = 0;
  let behind = 0;
  if (upstream && repo.head.commit) {
    const ab = aheadBehind(repo, repo.head.commit, upstream.sha);
    ahead = ab.ahead;
    behind = ab.behind;
  }

  return {
    branch,
    detached: branch === null,
    unborn: !repo.head.commit,
    staged,
    unstaged,
    untracked,
    conflicts: [...repo.conflicts],
    upstream: upstream ? `${upstream.remote}/${upstream.branch}` : null,
    ahead,
    behind,
    merging: repo.mergeState !== null,
    rebasing: repo.rebaseState !== null,
  };
}

export interface SwitchFailure {
  tracked: string[];
  untracked: string[];
}

/** Move the working tree + index to a snapshot, keeping safe untracked files. */
export function checkoutSnapshot(repo: Repo, target: Snapshot): SwitchFailure | null {
  const head = headSnapshot(repo);
  const trackedBlockers: string[] = [];
  const untrackedBlockers: string[] = [];
  const carry: string[] = [];

  for (const path of unionPaths(head, repo.index, repo.workdir)) {
    const h = head[path];
    const i = repo.index[path];
    const w = repo.workdir[path];
    const dirty = i !== h || (w !== i && (h !== undefined || i !== undefined));
    if (dirty) {
      if (h === undefined && target[path] === undefined) {
        carry.push(path);
        continue;
      }
      if (target[path] !== w) trackedBlockers.push(path);
      continue;
    }
    if (w !== undefined && h === undefined && i === undefined) {
      if (target[path] !== undefined && target[path] !== w) untrackedBlockers.push(path);
    }
  }

  if (trackedBlockers.length || untrackedBlockers.length) {
    return { tracked: trackedBlockers, untracked: untrackedBlockers };
  }

  const untracked: Snapshot = {};
  for (const path of Object.keys(repo.workdir)) {
    if (!(path in head) && !(path in repo.index)) untracked[path] = repo.workdir[path];
  }

  const nextIndex: Snapshot = { ...target };
  const nextWorkdir: Snapshot = { ...untracked, ...target };
  for (const path of carry) {
    nextIndex[path] = repo.index[path];
    nextWorkdir[path] = repo.workdir[path];
  }
  repo.index = nextIndex;
  repo.workdir = nextWorkdir;
  repo.conflicts = [];
  repo.mergeState = null;
  repo.rebaseState = null;
  return null;
}

export function installSnapshot(repo: Repo, snapshot: Snapshot, previousHead: Snapshot): void {
  const untracked: Snapshot = {};
  for (const path of Object.keys(repo.workdir)) {
    if (!(path in previousHead) && !(path in repo.index)) untracked[path] = repo.workdir[path];
  }
  repo.index = { ...snapshot };
  repo.workdir = { ...untracked, ...snapshot };
  repo.conflicts = [];
}

export interface MergeResult {
  snapshot: Snapshot;
  conflicts: string[];
  clean: boolean;
}

/** Three-way file merge. Conflicting files get git-style markers. */
export function mergeSnapshots(
  base: Snapshot,
  ours: Snapshot,
  theirs: Snapshot,
  label: string,
): MergeResult {
  const snapshot: Snapshot = {};
  const conflicts: string[] = [];
  for (const path of unionPaths(base, ours, theirs)) {
    const b = base[path];
    const o = ours[path];
    const t = theirs[path];
    if (o === t) {
      if (o !== undefined) snapshot[path] = o;
      continue;
    }
    if (o === b) {
      if (t !== undefined) snapshot[path] = t;
      continue;
    }
    if (t === b) {
      if (o !== undefined) snapshot[path] = o;
      continue;
    }
    conflicts.push(path);
    snapshot[path] = [
      '<<<<<<< HEAD',
      o ?? '',
      '=======',
      t ?? '',
      `>>>>>>> ${label}`,
      '',
    ].join('\n');
  }
  return { snapshot, conflicts, clean: conflicts.length === 0 };
}

/** Apply the per-file changes of a commit on top of a snapshot (cherry-pick / rebase / revert). */
export function applyCommitDiff(
  repo: Repo,
  target: Snapshot,
  commit: Commit,
  invert = false,
): Snapshot {
  const parent = commit.parents[0] ? repo.commits[commit.parents[0]] : null;
  const before = parent?.snapshot ?? {};
  const next: Snapshot = { ...target };
  for (const path of unionPaths(before, commit.snapshot)) {
    if (before[path] === commit.snapshot[path]) continue;
    const value = invert ? before[path] : commit.snapshot[path];
    if (value === undefined) delete next[path];
    else next[path] = value;
  }
  return next;
}

export function resetToCommit(repo: Repo, sha: string, mode: 'soft' | 'mixed' | 'hard'): void {
  const previousHead = headSnapshot(repo);
  if (repo.head.branch) repo.branches[repo.head.branch] = sha;
  repo.head.commit = sha;
  repo.mergeState = null;
  repo.rebaseState = null;
  repo.conflicts = [];
  if (mode !== 'soft') repo.index = { ...snapshotOf(repo, sha) };
  if (mode === 'hard') {
    const untracked: Snapshot = {};
    for (const path of Object.keys(repo.workdir)) {
      if (!(path in previousHead) && !(path in repo.index)) untracked[path] = repo.workdir[path];
    }
    repo.workdir = { ...untracked, ...snapshotOf(repo, sha) };
    repo.index = { ...snapshotOf(repo, sha) };
  }
}

export function deleteBranch(repo: Repo, name: string): void {
  const sha = repo.branches[name];
  delete repo.branches[name];
  if (sha) {
    repo.reflog.unshift({
      head: repo.head.commit,
      branch: repo.head.branch,
      message: `branch: Deleted branch ${name} (was ${sha.slice(0, 7)})`,
    });
  }
}

export function trackBranch(repo: Repo, remote: string, branch: string, sha: string, url?: string): void {
  const existing = repo.remotes[remote];
  const entry = existing ?? {
    name: remote,
    url: url ?? `https://github.com/you/${repo.dir.split('/').pop() ?? 'project'}.git`,
    tracking: {},
    server: {},
    tags: {},
  };
  entry.tracking[branch] = sha;
  if (!(branch in entry.server)) entry.server[branch] = sha;
  repo.remotes[remote] = entry;
}
