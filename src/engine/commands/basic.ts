import type { Io, Repo, Snapshot } from '../types.ts';
import { ensureRepo, flagValue, hasFlag, parseArgs } from '../io.ts';
import {
  commitToHead,
  createCommit,
  headSnapshot,
  recordReflog,
  resolveRef,
  snapshotOf,
} from '../repo.ts';
import { diffText, statsText, statusText } from '../format.ts';
import { isIgnored, matchesGlob, plural, shortId, snapshotsEqual, unionPaths } from '../util.ts';

type PathMatcher = (path: string) => boolean;

function matcherFor(spec: string): PathMatcher {
  if (spec === '.' || spec === './') return () => true;
  if (spec.endsWith('/')) return (path) => path.startsWith(spec);
  if (spec.includes('*') || spec.includes('?') || spec.includes('[')) {
    return (path) => matchesGlob(spec, path);
  }
  return (path) => path === spec || path.startsWith(`${spec}/`);
}

export function cmdInit(repo: Repo, args: string[], io: Io): void {
  const parsed = parseArgs(args, ['-b', '--initial-branch']);
  if (repo.initialized) {
    io.out(`Reinitialized existing Git repository in ${repo.dir}/.git/`);
    io.say('This folder was already a repository, so nothing was reset.');
    return;
  }
  const branch = flagValue(parsed, '-b', '--initial-branch') ?? 'main';
  repo.initialized = true;
  repo.head = { branch, commit: null };
  repo.index = {};
  repo.reflog = [];
  io.out(`Initialized empty Git repository in ${repo.dir}/.git/`);
  io.touch('workdir');
  io.say(
    `Git created a hidden .git folder and will track this folder from now on. The first branch is "${branch}" and it has no commits yet.`,
  );
}

export function cmdStatus(repo: Repo, _args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  io.out(statusText(repo).join('\n'));
  io.touch('workdir', 'index');
  io.say(
    'Status compares three snapshots: your working directory, the staging area, and the last commit.',
  );
}

export function cmdAdd(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const all = hasFlag(parsed, '-A', '--all', '-u', '--update');
  const specs = [...parsed.positionals, ...parsed.rest];

  if (!specs.length) {
    io.err('Nothing specified, nothing added.');
    io.muted("hint: Maybe you wanted to say 'git add .'?");
    io.say('Tell Git which path to stage, for example `git add index.html` or `git add .`.');
    return;
  }

  const stageEverything = all || specs.some((spec) => spec === '.' || spec === './');
  const matchers = specs.map(matcherFor);
  const universe = unionPaths(headSnapshot(repo), repo.index, repo.workdir);

  const ignored: string[] = [];
  const resolved = new Set<string>();
  let staged = 0;
  let removed = 0;

  for (const path of universe) {
    if (!stageEverything && !matchers.some((match) => match(path))) continue;
    if (repo.conflicts.includes(path)) resolved.add(path);
    if (!(path in repo.workdir)) {
      if (path in repo.index) {
        delete repo.index[path];
        removed++;
      }
      continue;
    }
    if (isIgnored(repo, path)) {
      if (!stageEverything) ignored.push(path);
      continue;
    }
    if (repo.index[path] !== repo.workdir[path]) {
      repo.index[path] = repo.workdir[path];
      staged++;
    }
  }

  if (!stageEverything) {
    for (const spec of specs) {
      if (!universe.some(matcherFor(spec))) {
        io.err(`fatal: pathspec '${spec}' did not match any files`);
      }
    }
  }

  if (ignored.length) {
    io.err('The following paths are ignored by one of your .gitignore files:');
    for (const path of ignored) io.err(path);
    io.muted('hint: Use -f if you really want to add them.');
  }

  if (resolved.size) {
    repo.conflicts = repo.conflicts.filter((path) => !resolved.has(path));
  }

  if (!staged && !removed) {
    if (!io.error) io.say('Nothing new to stage — the index already matches those files.');
    return;
  }

  io.touch('index');
  const bits: string[] = [];
  if (staged) bits.push(`staged ${plural(staged, 'file')}`);
  if (removed) bits.push(`recorded ${plural(removed, 'deletion')}`);
  io.say(
    `Git copied ${bits.join(' and ')} into the index. The index is the exact snapshot your next commit will save.`,
  );
}

export function cmdCommit(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args, ['-m', '--message', '--author']);
  const amend = hasFlag(parsed, '--amend');
  const stageTracked = hasFlag(parsed, '-a', '--all');
  const allowEmpty = hasFlag(parsed, '--allow-empty');

  if (repo.conflicts.length) {
    io.err('error: Committing is not possible because you have unmerged files.');
    io.muted("hint: Fix them up in the work tree, and then use 'git add/rm <file>'");
    io.muted('hint: as appropriate to mark resolution and make a commit.');
    io.say('Open the conflicted file, keep the lines you want, remove the markers, then `git add` it.');
    return;
  }

  if (stageTracked) {
    const head = headSnapshot(repo);
    for (const path of unionPaths(head, repo.index)) {
      if (path in repo.workdir) repo.index[path] = repo.workdir[path];
      else delete repo.index[path];
    }
    io.touch('index');
  }

  const before = headSnapshot(repo);
  const mergeParents = repo.mergeState ? [repo.mergeState.target] : [];
  const messageText = parsed.values['-m']?.join('\n\n') ?? parsed.values['--message']?.join('\n\n');
  const stagedChanges = !snapshotsEqual(repo.index, before);

  if (!messageText && !repo.mergeState && !amend) {
    io.err('Aborting commit due to empty commit message.');
    io.say('A commit always needs a message. Add one with `git commit -m "what changed"`.');
    return;
  }

  if (!amend && !stagedChanges && !allowEmpty && !repo.mergeState) {
    io.out(`On branch ${repo.head.branch ?? 'HEAD'}`);
    const untracked = Object.keys(repo.workdir).filter(
      (path) => !(path in before) && !(path in repo.index) && !isIgnored(repo, path),
    );
    if (untracked.length) {
      io.out('nothing added to commit but untracked files present (use "git add" to track)');
      io.say('Untracked files are invisible to commits until you stage them with `git add`.');
    } else {
      io.out('nothing to commit, working tree clean');
      io.say('Everything in the working directory is already saved in the last commit.');
    }
    return;
  }

  if (amend) {
    const old = repo.head.commit ? repo.commits[repo.head.commit] : null;
    if (!old) {
      io.err('fatal: You have nothing to amend.');
      return;
    }
    const message = messageText ?? old.message;
    const rewritten = createCommit(repo, message, repo.index, old.parents, old.author);
    if (repo.head.branch) repo.branches[repo.head.branch] = rewritten.id;
    repo.head.commit = rewritten.id;
    recordReflog(repo, `commit (amend): ${message.split('\n')[0]}`);
    io.out(`[${repo.head.branch ?? 'detached HEAD'} ${shortId(rewritten.id)}] ${message}`);
    const stats = statsText(snapshotOf(repo, old.parents[0] ?? null), rewritten.snapshot);
    if (stats) io.muted(` ${stats}`);
    io.touch('head', 'graph');
    io.say(
      'The last commit was replaced by a new one with the same parent. The old id survives only in the reflog.',
    );
    return;
  }

  const message =
    messageText ?? (repo.mergeState ? `Merge branch '${repo.mergeState.targetLabel}'` : '(no message)');
  const commit = commitToHead(repo, message, mergeParents);
  repo.mergeState = null;
  repo.conflicts = [];
  io.out(`[${repo.head.branch ?? 'detached HEAD'} ${shortId(commit.id)}] ${message}`);
  const stats = statsText(before, commit.snapshot);
  if (stats) io.muted(` ${stats}`);
  io.touch('head', 'index', 'workdir', 'graph');
  io.say(
    `A new commit object was created. The branch pointer "${repo.head.branch ?? 'HEAD'}" now points at it, and the staging area is the new baseline.`,
  );
}

export function cmdDiff(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const staged = hasFlag(parsed, '--staged', '--cached');
  const spec = parsed.positionals[0];

  let before: Snapshot;
  let after: Snapshot;
  if (staged) {
    before = headSnapshot(repo);
    after = repo.index;
  } else if (spec) {
    const sha = resolveRef(repo, spec);
    if (!sha) {
      io.err(`fatal: ambiguous argument '${spec}': unknown revision or path not in the working tree.`);
      return;
    }
    before = snapshotOf(repo, sha);
    after = repo.workdir;
  } else {
    before = repo.index;
    after = repo.workdir;
  }

  const lines = diffText(before, after);
  if (!lines.length) {
    io.say(
      staged
        ? 'No staged changes — the index and the last commit are identical.'
        : 'No unstaged changes — the working directory matches the index.',
    );
    return;
  }
  io.out(lines.join('\n'));
  io.touch('workdir', 'index');
  io.say(
    staged
      ? 'This diff shows what the next commit would add: the index compared to HEAD.'
      : 'This diff compares your files on disk with the staging area (- = removed, + = added).',
  );
}

export function cmdRestore(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args, ['--source']);
  const staged = hasFlag(parsed, '--staged', '-S');
  const worktree = hasFlag(parsed, '--worktree', '-W') || !staged;
  const sourceSpec = flagValue(parsed, '--source');
  const specs = [...parsed.positionals, ...parsed.rest];

  if (!specs.length) {
    io.err('fatal: you must specify path(s) to restore');
    return;
  }

  const source = sourceSpec ? snapshotOf(repo, resolveRef(repo, sourceSpec)) : headSnapshot(repo);
  let touched = 0;
  for (const spec of specs) {
    const match = matcherFor(spec);
    const candidates = unionPaths(repo.index, repo.workdir, source).filter(match);
    if (!candidates.length) {
      io.err(`error: pathspec '${spec}' did not match any file(s) known to git`);
      continue;
    }
    for (const path of candidates) {
      if (staged) {
        if (source[path] === undefined) delete repo.index[path];
        else repo.index[path] = source[path];
      }
      if (worktree) {
        if (repo.index[path] === undefined) delete repo.workdir[path];
        else repo.workdir[path] = repo.index[path];
      }
      touched++;
    }
  }
  if (touched) {
    io.touch(staged ? 'index' : 'workdir');
    io.say(
      staged
        ? 'The index was reset for those files; the working directory kept your edits.'
        : 'Those files were overwritten from the index. The edit is gone for good.',
    );
  }
}

export function cmdRm(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const cached = hasFlag(parsed, '--cached');
  if (!parsed.positionals.length) {
    io.err('fatal: No pathspec was given. Which files should I remove?');
    return;
  }
  let removed = 0;
  for (const spec of parsed.positionals) {
    const match = matcherFor(spec);
    const paths = unionPaths(repo.index, repo.workdir).filter(match);
    if (!paths.length) {
      io.err(`fatal: pathspec '${spec}' did not match any files`);
      continue;
    }
    for (const path of paths) {
      io.out(`rm '${path}'`);
      delete repo.index[path];
      if (!cached) delete repo.workdir[path];
      removed++;
    }
  }
  if (removed) {
    io.touch('workdir', 'index');
    io.say('The deletion is staged. Commit it to finish removing the file from history.');
  }
}
