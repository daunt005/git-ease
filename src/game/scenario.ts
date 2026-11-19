import type { Commit, PresetRemote, Repo } from '../engine/types.ts';
import { createRepo, createCommit, headSnapshot, installSnapshot } from '../engine/repo.ts';

export function labRepo(files: Record<string, string> = {}, initialized = true): Repo {
  const repo = createRepo();
  repo.initialized = initialized;
  repo.workdir = { ...files };
  return repo;
}

export function put(repo: Repo, files: Record<string, string>): void {
  Object.assign(repo.workdir, files);
}

export function seedCommit(repo: Repo, message: string, files: Record<string, string> = {}): Commit {
  Object.assign(repo.workdir, files);
  Object.assign(repo.index, files);
  const parents = repo.head.commit ? [repo.head.commit] : [];
  const commit = createCommit(repo, message, { ...repo.index }, parents);
  if (repo.head.branch) repo.branches[repo.head.branch] = commit.id;
  repo.head.commit = commit.id;
  repo.reflog.unshift({
    head: commit.id,
    branch: repo.head.branch,
    message: `commit: ${message}`,
  });
  return commit;
}

export function switchTo(repo: Repo, name: string): void {
  const sha = repo.branches[name];
  if (!sha) throw new Error(`seed: branch ${name} has no commits`);
  const target = repo.commits[sha].snapshot;
  const previous = headSnapshot(repo);
  installSnapshot(repo, target, previous);
  repo.head = { branch: name, commit: sha };
}

export function seedBranch(repo: Repo, name: string, from?: string): void {
  const sha = from ? repo.branches[from] : repo.head.commit;
  if (!sha) throw new Error('seed: cannot branch before the first commit');
  repo.branches[name] = sha;
  switchTo(repo, name);
}

export function presetFrom(repo: Repo): PresetRemote {
  return {
    branches: { ...repo.branches },
    commits: structuredClone(repo.commits),
  };
}

export function cloneFrom(preset: PresetRemote, url: string, folder: string): Repo {
  const branch = 'main' in preset.branches ? 'main' : Object.keys(preset.branches)[0];
  const sha = preset.branches[branch];
  const snapshot = preset.commits[sha]?.snapshot ?? {};
  const repo = createRepo();
  repo.initialized = true;
  repo.dir = `~/${folder}`;
  repo.commits = structuredClone(preset.commits);
  repo.branches = { [branch]: sha };
  repo.head = { branch, commit: sha };
  repo.index = { ...snapshot };
  repo.workdir = { ...snapshot };
  repo.remotes = {
    origin: {
      name: 'origin',
      url,
      tracking: { ...preset.branches },
      server: { ...preset.branches },
      tags: {},
    },
  };
  repo.clock = Math.max(repo.clock, ...Object.values(preset.commits).map((commit) => commit.time));
  repo.reflog = [{ head: sha, branch, message: `clone: from ${url}` }];
  return repo;
}

/** A folder that is not a repo yet, but can clone from one preset URL. */
export function cloneLab(preset: PresetRemote, url: string, files: Record<string, string> = {}): Repo {
  const repo = createRepo();
  repo.workdir = { ...files };
  repo.presets[url] = preset;
  return repo;
}

/**
 * Some solutions point at a commit the player must find themselves. When the UI
 * inserts a solution path, fill in the real hash so the command is runnable.
 */
export function resolveSolutionCommand(repo: Repo, command: string): string {
  const byMessage = (message: string): string | undefined =>
    Object.values(repo.commits).find((commit) => commit.message === message)?.id;

  let resolved = command;
  if (resolved.includes('<sha-of-Fix-login-redirect>')) {
    const sha = byMessage('Fix login redirect');
    if (sha) resolved = resolved.replaceAll('<sha-of-Fix-login-redirect>', sha);
  }
  if (resolved.includes('<sha>')) {
    const sha = byMessage('Add pricing page');
    if (sha) resolved = resolved.replaceAll('<sha>', sha);
  }
  return resolved;
}

/** Simulate a teammate pushing a commit to the remote. Local refs are untouched. */
export function teammatePush(
  repo: Repo,
  branch: string,
  files: Record<string, string>,
  message: string,
  author = 'Sam (teammate)',
): Commit {
  const remote = repo.remotes.origin;
  const parent = remote.server[branch];
  const snapshot = { ...(parent ? repo.commits[parent]?.snapshot ?? {} : {}), ...files };
  const commit = createCommit(repo, message, snapshot, parent ? [parent] : [], author);
  remote.server[branch] = commit.id;
  return commit;
}

export function headOf(repo: Repo): Commit | null {
  return repo.head.commit ? repo.commits[repo.head.commit] : null;
}

export function headMessage(repo: Repo): string {
  return headOf(repo)?.message ?? '';
}

export function countReachable(repo: Repo): number {
  if (!repo.head.commit) return 0;
  const seen = new Set<string>();
  const stack = [repo.head.commit];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const parent of repo.commits[id]?.parents ?? []) stack.push(parent);
  }
  return seen.size;
}

export function hasMarkers(text: string | undefined): boolean {
  return !!text && /^(<{7}|={7}|>{7})/m.test(text);
}
