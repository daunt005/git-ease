import type { Io, Repo } from '../types.ts';
import { ensureRepo, flagValue, hasFlag, parseArgs } from '../io.ts';
import {
  applyCommitDiff,
  commitToHead,
  createCommit,
  headSnapshot,
  installSnapshot,
  resetToCommit,
  resolveRef,
  snapshotOf,
} from '../repo.ts';
import { decorations, diffText, statsText, statusText } from '../format.ts';
import { firstLine, shortId, unionPaths } from '../util.ts';
import { collectTips, layoutGraph } from '../graph.ts';

function matcherFor(spec: string): (path: string) => boolean {
  if (spec === '.' || spec === './') return () => true;
  if (spec.endsWith('/')) return (path) => path.startsWith(spec);
  return (path) => path === spec || path.startsWith(`${spec}/`);
}

export function cmdLog(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args, ['-n', '--max-count']);
  const all = hasFlag(parsed, '--all');
  const graph = hasFlag(parsed, '--graph');
  const oneline = hasFlag(parsed, '--oneline');
  const startSpec = parsed.positionals[0];

  let tips: string[];
  if (startSpec) {
    const sha = resolveRef(repo, startSpec);
    if (!sha) {
      io.err(`fatal: ambiguous argument '${startSpec}': unknown revision or path not in the working tree.`);
      return;
    }
    tips = [sha];
  } else {
    tips = collectTips(repo, all);
    if (!all && repo.head.commit) tips.push(repo.head.commit);
  }

  if (!tips.length) {
    io.err(`fatal: your current branch '${repo.head.branch ?? 'HEAD'}' does not have any commits yet`);
    io.say('Make a commit first — there is no history to show.');
    return;
  }

  const layout = layoutGraph(repo, [...new Set(tips)]);
  const limitRaw = flagValue(parsed, '-n', '--max-count');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const nodes = Number.isFinite(limit) ? layout.nodes.slice(0, limit) : layout.nodes;

  if (!nodes.length) {
    io.err('fatal: your current branch does not have any commits yet');
    return;
  }

  if (graph) {
    for (const node of nodes) {
      const prefix = '| '.repeat(node.col) + '* ';
      if (oneline) {
        io.out(
          `${prefix}${shortId(node.commit.id)}${decorations(repo, node.commit.id)} ${firstLine(
            node.commit.message,
          )}`,
        );
      } else {
        io.out(`${prefix}commit ${node.commit.id}${decorations(repo, node.commit.id)}`);
        io.out(`${'| '.repeat(node.col + 1)}Author: ${node.commit.author} <${node.commit.email}>`);
        io.out(`${'| '.repeat(node.col + 1)}Date:   ${new Date(node.commit.time * 1000).toUTCString()}`);
        io.out('');
        for (const line of node.commit.message.split('\n')) {
          io.out(`${'| '.repeat(node.col + 1)}    ${line}`);
        }
        io.out('');
      }
    }
    io.touch('graph');
    io.say(
      'The graph view shows how commits connect through their parents. Every * is a commit; merges have two parents.',
    );
    return;
  }

  const blocks: string[] = [];
  for (const node of nodes) {
    if (oneline) {
      blocks.push(
        `${shortId(node.commit.id)}${decorations(repo, node.commit.id)} ${firstLine(
          node.commit.message,
        )}`,
      );
    } else {
      blocks.push(
        [
          `commit ${node.commit.id}${decorations(repo, node.commit.id)}`,
          `Author: ${node.commit.author} <${node.commit.email}>`,
          `Date:   ${new Date(node.commit.time * 1000).toUTCString()}`,
          '',
          ...node.commit.message.split('\n').map((line) => `    ${line}`),
        ].join('\n'),
      );
    }
  }
  io.out(blocks.join('\n\n'));
  io.touch('graph');
  io.say(
    'Log walks backwards from HEAD through parent links. The newest commit is printed first.',
  );
}

export function cmdReset(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const mode = hasFlag(parsed, '--hard') ? 'hard' : hasFlag(parsed, '--soft') ? 'soft' : 'mixed';

  let targetSpec = 'HEAD';
  let paths: string[] = [];
  if (parsed.rest.length) {
    paths = parsed.rest;
    if (parsed.positionals[0]) targetSpec = parsed.positionals[0];
  } else if (parsed.positionals.length > 1) {
    targetSpec = parsed.positionals[0];
    paths = parsed.positionals.slice(1);
  } else if (parsed.positionals.length === 1) {
    if (resolveRef(repo, parsed.positionals[0])) targetSpec = parsed.positionals[0];
    else paths = parsed.positionals;
  }

  const targetSha = resolveRef(repo, targetSpec);
  if (!targetSha) {
    io.err(`fatal: ambiguous argument '${targetSpec}': unknown revision or path not in the working tree.`);
    return;
  }

  if (paths.length) {
    const source = snapshotOf(repo, targetSha);
    let count = 0;
    for (const path of unionPaths(source, repo.index)) {
      if (!paths.some((spec) => matcherFor(spec)(path))) continue;
      if (source[path] === undefined) delete repo.index[path];
      else repo.index[path] = source[path];
      count++;
    }
    if (!count) {
      io.err('fatal: pathspec did not match any files');
      return;
    }
    io.touch('index');
    io.say('The path was unstaged: the index now matches the target commit, but your file on disk is untouched.');
    return;
  }

  const before = headSnapshot(repo);
  resetToCommit(repo, targetSha, mode);
  io.touch('head', 'graph', 'workdir', 'index');
  if (mode === 'hard') {
    io.out(`HEAD is now at ${shortId(targetSha)} ${firstLine(repo.commits[targetSha].message)}`);
    io.say('Hard reset: the branch, the index, and your files all jumped to the target commit. Uncommitted work is gone.');
  } else if (mode === 'soft') {
    io.say('Soft reset: the branch pointer moved back, but the index and your files still hold the newer snapshot — so those changes now appear staged.');
  } else {
    io.say('Mixed reset (the default): the branch and index moved back, but your files were left alone — so the changes now appear unstaged.');
  }
  const stats = statsText(before, snapshotOf(repo, targetSha));
  if (stats) io.muted(` ${stats}`);
}

export function cmdRevert(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const spec = parsed.positionals[0];
  if (!spec) {
    io.err('fatal: bad revision: revert needs a commit');
    io.say('Pick the commit to undo, e.g. `git revert abc1234`.');
    return;
  }
  const sha = resolveRef(repo, spec);
  if (!sha || !repo.commits[sha]) {
    io.err(`fatal: bad revision '${spec}'`);
    return;
  }
  const target = repo.commits[sha];
  if (target.parents.length > 1) {
    io.err('error: commit is a merge but no -m option was given.');
    io.say('Reverting a merge needs to know which parent to keep. Not supported in this lab.');
    return;
  }
  if (!repo.head.commit) {
    io.err('fatal: cannot revert on an unborn branch');
    return;
  }
  if (repo.conflicts.length) {
    io.err('error: your local changes would be overwritten by revert.');
    return;
  }

  const before = headSnapshot(repo);
  const parentSnap = snapshotOf(repo, target.parents[0] ?? null);
  const touched = unionPaths(parentSnap, target.snapshot).filter(
    (path) => parentSnap[path] !== target.snapshot[path],
  );
  const clashes = touched.filter(
    (path) => before[path] !== target.snapshot[path] && before[path] !== parentSnap[path],
  );
  if (clashes.length) {
    io.err(`error: could not revert ${shortId(sha)}... conflicting changes in:`);
    for (const path of clashes) io.err(`\t${path}`);
    io.say('The file changed again after the bad commit, so Git cannot reverse it cleanly.');
    return;
  }

  const inverted = applyCommitDiff(repo, before, target, true);
  const message = `Revert "${firstLine(target.message)}"\n\nThis reverts commit ${target.id}.`;
  const commit = commitToHead(repo, message, [], inverted);
  installSnapshot(repo, inverted, before);
  io.out(`[${repo.head.branch ?? 'detached HEAD'} ${shortId(commit.id)}] ${firstLine(message)}`);
  const stats = statsText(before, inverted);
  if (stats) io.muted(` ${stats}`);
  io.touch('head', 'graph', 'workdir', 'index');
  io.say(
    'Instead of deleting history, revert created a new commit that undoes the old one. Safe for branches other people already pulled.',
  );
}

export function cmdCherryPick(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  if (!parsed.positionals.length) {
    io.err('fatal: bad revision: cherry-pick needs a commit');
    return;
  }
  for (const spec of parsed.positionals) {
    const sha = resolveRef(repo, spec);
    if (!sha || !repo.commits[sha]) {
      io.err(`fatal: bad revision '${spec}'`);
      continue;
    }
    if (!repo.head.commit) {
      io.err('fatal: cannot cherry-pick onto an unborn branch');
      return;
    }
    const source = repo.commits[sha];
    const before = headSnapshot(repo);
    const snapshot = applyCommitDiff(repo, before, source);
    const commit = commitToHead(repo, source.message, [], snapshot);
    installSnapshot(repo, snapshot, before);
    io.out(`[${repo.head.branch ?? 'detached HEAD'} ${shortId(commit.id)}] ${firstLine(source.message)}`);
    const stats = statsText(before, snapshot);
    if (stats) io.muted(` ${stats}`);
    io.touch('head', 'graph', 'workdir', 'index');
    io.say(
      `Copied the changes from ${shortId(sha)} onto the current branch. The new commit has a different hash because its parent is different.`,
    );
  }
}

export function cmdTag(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args, ['-m', '--message']);
  const del = hasFlag(parsed, '-d', '--delete');
  const names = parsed.positionals;

  if (del) {
    if (!names.length) {
      io.err('fatal: tag name required');
      return;
    }
    for (const name of names) {
      if (!(name in repo.tags)) {
        io.err(`error: tag '${name}' not found.`);
        continue;
      }
      const was = shortId(repo.tags[name]);
      delete repo.tags[name];
      io.out(`Deleted tag '${name}' (was ${was})`);
      io.touch('graph');
    }
    io.say('The tag label was removed. The commit it pointed to is untouched.');
    return;
  }

  if (!names.length) {
    const tags = Object.keys(repo.tags).sort();
    if (tags.length) io.out(tags.join('\n'));
    io.say('Tags are fixed labels for important commits, usually releases.');
    return;
  }

  const name = names[0];
  if (name in repo.tags) {
    io.err(`fatal: tag '${name}' already exists`);
    return;
  }
  const sha = names[1] ? resolveRef(repo, names[1]) : repo.head.commit;
  if (!sha) {
    io.err(`fatal: Failed to resolve '${names[1] ?? 'HEAD'}' as a valid ref.`);
    return;
  }
  repo.tags[name] = sha;
  io.touch('graph');
  io.say(
    `Tag "${name}" now points at ${shortId(sha)}. ${
      hasFlag(parsed, '-a', '--annotate') ? 'An annotated tag also stores a message and tagger.' : 'This is a lightweight tag: just a name pointing at a commit.'
    }`,
  );
}

export function cmdReflog(repo: Repo, _args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  if (!repo.reflog.length) {
    io.say('The reflog is empty — HEAD has not moved yet.');
    return;
  }
  const lines = repo.reflog.map(
    (entry, index) => `${shortId(entry.head)} HEAD@{${index}}: ${entry.message}`,
  );
  io.out(lines.join('\n'));
  io.touch('graph');
  io.say(
    'The reflog is a local diary of everywhere HEAD has been. It can resurrect commits that no branch points to anymore.',
  );
}

export function cmdStash(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args, ['-m', '--message']);
  const first = parsed.positionals[0];
  const sub = !first || first.startsWith('-') ? 'push' : first;
  const rest = first ? parsed.positionals.slice(1) : [];

  if (sub === 'list') {
    if (!repo.stash.length) {
      io.say('No stash entries yet. `git stash` saves uncommitted changes for later.');
      return;
    }
    io.out(repo.stash.map((entry, index) => `stash@{${index}}: ${entry.message}`).join('\n'));
    io.say('These are saved snapshots of work-in-progress, kept outside any branch.');
    return;
  }

  if (sub === 'show') {
    if (!repo.stash.length) {
      io.err('fatal: no stash entries found.');
      return;
    }
    const entry = repo.stash[0];
    const lines = diffText(headSnapshot(repo), entry.snapshot);
    io.out(lines.join('\n'));
    io.say('This is what the top stash entry changes relative to the current HEAD.');
    return;
  }

  if (sub === 'clear') {
    repo.stash = [];
    io.touch('workdir');
    io.say('All stash entries were dropped. There is no undo for this one.');
    return;
  }

  if (sub === 'drop') {
    if (!repo.stash.length) {
      io.err('fatal: no stash entries found.');
      return;
    }
    const index = Number(rest[0] ?? 0);
    const [entry] = repo.stash.splice(index, 1);
    if (!entry) {
      io.err(`error: stash@{${index}} not found`);
      return;
    }
    io.out(`Dropped refs/stash@{${index}} (${shortId(entry.commit)})`);
    io.say('The saved snapshot was discarded without being applied.');
    return;
  }

  if (sub === 'pop' || sub === 'apply') {
    if (!repo.stash.length) {
      io.err('No stash entries found.');
      return;
    }
    const entry = repo.stash[0];
    const head = headSnapshot(repo);
    const untracked: Record<string, string> = {};
    for (const path of Object.keys(repo.workdir)) {
      if (!(path in head) && !(path in repo.index)) untracked[path] = repo.workdir[path];
    }
    repo.workdir = { ...untracked, ...entry.snapshot };
    repo.index = { ...entry.index };
    repo.conflicts = [];
    if (sub === 'pop') repo.stash.shift();
    io.out(statusText(repo).join('\n'));
    if (sub === 'pop') {
      io.out('');
      io.out(`Dropped refs/stash@{0} (${shortId(entry.commit)})`);
    }
    io.touch('workdir', 'index');
    io.say(
      'The saved snapshot was written back into your working directory. Review it, then stage and commit as usual.',
    );
    return;
  }

  if (sub !== 'push' && sub !== 'save') {
    io.err(`error: unknown subcommand: ${sub}`);
    return;
  }

  const messageFlag = flagValue(parsed, '-m', '--message');
  const customMessage = messageFlag ?? (sub === 'save' ? rest.join(' ') : undefined);

  const before = headSnapshot(repo);
  const hasStaged = JSON.stringify(repo.index) !== JSON.stringify(before);
  const hasUnstaged = unionPaths(before, repo.workdir).some(
    (path) => repo.index[path] !== repo.workdir[path],
  );
  if (!hasStaged && !hasUnstaged) {
    io.out('No local changes to save');
    io.say('There is nothing to stash — the working directory already matches the last commit.');
    return;
  }

  const branch = repo.head.branch ?? 'HEAD';
  const subject = repo.head.commit ? firstLine(repo.commits[repo.head.commit].message) : 'no commits yet';
  const message =
    customMessage || `WIP on ${branch}: ${shortId(repo.head.commit)} ${subject}`;

  const snapshot = { ...repo.workdir };
  const stashCommit = createCommit(repo, message, snapshot, repo.head.commit ? [repo.head.commit] : []);
  repo.stash.unshift({
    message,
    branch,
    commit: stashCommit.id,
    snapshot,
    index: { ...repo.index },
  });
  installSnapshot(repo, before, before);
  io.touch('workdir', 'index');
  io.out(`Saved working directory and index state ${message}`);
  io.say(
    'Your changes were packed into a stash commit and the working directory was reset to HEAD. Pop them back later with `git stash pop`.',
  );
}
