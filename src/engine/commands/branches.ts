import type { Io, Repo } from '../types.ts';
import { ensureRepo, flagValue, hasFlag, parseArgs } from '../io.ts';
import {
  applyCommitDiff,
  ancestors,
  checkoutSnapshot,
  commitToHead,
  createCommit,
  deleteBranch,
  detachHead,
  headSnapshot,
  installSnapshot,
  isAncestor,
  mergeBase,
  mergeSnapshots,
  recordReflog,
  resolveRef,
  snapshotOf,
  switchBranch,
} from '../repo.ts';
import { statsText } from '../format.ts';
import { firstLine, shortId } from '../util.ts';

function currentLabel(repo: Repo): string {
  return repo.head.branch ?? shortId(repo.head.commit) ?? 'HEAD';
}

function printCheckoutFailure(failure: { tracked: string[]; untracked: string[] }, io: Io): void {
  if (failure.tracked.length) {
    io.err('error: Your local changes to the following files would be overwritten by checkout:');
    for (const path of failure.tracked) io.err(`\t${path}`);
    io.err('Please commit your changes or stash them before you switch branches.');
    io.err('Aborting');
    io.say('Commit or stash your work first. Git refuses to silently throw your edits away.');
    return;
  }
  if (failure.untracked.length) {
    io.err('error: The following untracked working tree files would be overwritten by checkout:');
    for (const path of failure.untracked) io.err(`\t${path}`);
    io.err('Please move or remove them before you switch branches.');
    io.err('Aborting');
    io.say('An untracked file is in the way. Rename or remove it, then try again.');
  }
}

function applyCheckout(repo: Repo, sha: string, io: Io): boolean {
  const failure = checkoutSnapshot(repo, snapshotOf(repo, sha));
  if (failure) {
    printCheckoutFailure(failure, io);
    return false;
  }
  return true;
}

function checkoutPaths(repo: Repo, paths: string[], io: Io): void {
  let restored = 0;
  for (const path of paths) {
    if (path in repo.index) {
      repo.workdir[path] = repo.index[path];
      restored++;
    } else if (path === '.' || path === './') {
      for (const key of Object.keys(repo.index)) {
        repo.workdir[key] = repo.index[key];
        restored++;
      }
    } else {
      io.err(`error: pathspec '${path}' did not match any file(s) known to git`);
    }
  }
  if (restored) {
    io.touch('workdir');
    io.say('Those files were reset to the version stored in the staging area.');
  }
}

export function cmdCheckout(repo: Repo, args: string[], io: Io, mode: 'checkout' | 'switch'): void {
  if (!ensureRepo(repo, io)) return;
  const valueFlags =
    mode === 'checkout' ? ['-b', '-B', '--orphan'] : ['-c', '-C', '-b', '-B', '--orphan'];
  const parsed = parseArgs(args, valueFlags);

  if (mode === 'checkout' && (parsed.rest.length || (parsed.positionals[0] === '--' && parsed.rest.length))) {
    checkoutPaths(repo, parsed.rest, io);
    return;
  }

  if (repo.conflicts.length) {
    io.err('error: you need to resolve your current index first');
    io.say('Resolve the conflicted files (edit + `git add`) before switching branches.');
    return;
  }

  const createName = flagValue(parsed, '-b', '-c', '-B', '-C', '--orphan');
  const forceCreate = hasFlag(parsed, '-B', '-C');

  if (createName) {
    if (createName in repo.branches && !forceCreate) {
      io.err(`fatal: a branch named '${createName}' already exists`);
      io.say('Pick another branch name, or switch to the existing branch.');
      return;
    }
    const startSpec = parsed.positionals[0];
    const startSha = startSpec ? resolveRef(repo, startSpec) : repo.head.commit;
    if (startSpec && !startSha) {
      io.err(`fatal: '${startSpec}' is not a valid object name: cannot create branch.`);
      return;
    }
    if (!startSha) {
      repo.head = { branch: createName, commit: null };
      recordReflog(repo, `checkout: moving from ${currentLabel(repo)} to ${createName}`);
      io.out(`Switched to a new branch '${createName}'`);
      io.touch('graph', 'head');
      io.say(
        `Branch "${createName}" is unborn — it will get its first commit when you commit. A branch is just a movable pointer.`,
      );
      return;
    }
    if (!applyCheckout(repo, startSha, io)) return;
    const from = currentLabel(repo);
    repo.branches[createName] = startSha;
    switchBranch(repo, createName);
    recordReflog(repo, `checkout: moving from ${from} to ${createName}`);
    io.out(`Switched to a new branch '${createName}'`);
    io.touch('graph', 'head', 'workdir', 'index');
    io.say(
      `Created "${createName}" pointing at ${shortId(startSha)} and moved HEAD onto it. New commits will move this branch, not the old one.`,
    );
    return;
  }

  const spec = parsed.positionals[0];
  if (!spec) {
    io.err('fatal: you must specify a branch or commit');
    io.say('Try `git switch main` or `git checkout -b my-branch`.');
    return;
  }

  if (repo.head.branch === spec) {
    io.out(`Already on '${spec}'`);
    io.say('HEAD is already attached to that branch.');
    return;
  }

  if (spec in repo.branches) {
    const sha = repo.branches[spec];
    if (!applyCheckout(repo, sha, io)) return;
    const from = currentLabel(repo);
    switchBranch(repo, spec);
    recordReflog(repo, `checkout: moving from ${from} to ${spec}`);
    io.out(
      mode === 'switch' ? `Switched to branch '${spec}'` : `Switched to branch '${spec}'`,
    );
    io.touch('graph', 'head', 'workdir', 'index');
    io.say(
      `HEAD now points at "${spec}". The working directory was updated to match ${shortId(sha)}, so the files you see are that branch's snapshot.`,
    );
    return;
  }

  const sha = resolveRef(repo, spec);
  if (!sha) {
    io.err(`error: pathspec '${spec}' did not match any file(s) known to git`);
    io.say('Check the spelling, or list branches with `git branch`.');
    return;
  }

  if (mode === 'switch' && !hasFlag(parsed, '--detach')) {
    io.err(`fatal: a branch is expected, got commit '${spec}'`);
    io.muted('hint: If you want to detach HEAD at a commit, use:');
    io.muted(`hint:   git switch --detach ${spec}`);
    io.say('`git switch` only takes branches unless you explicitly ask for --detach.');
    return;
  }

  if (!applyCheckout(repo, sha, io)) return;
  const from = currentLabel(repo);
  detachHead(repo, sha);
  recordReflog(repo, `checkout: moving from ${from} to ${shortId(sha)}`);
  io.out(`Note: switching to '${shortId(sha)}'.`);
  io.out('');
  io.out('You are in \'detached HEAD\' state. You can look around, make experimental');
  io.out('changes and commit them, and discard any commits you make in this');
  io.out('state without impacting any branches by switching back to a branch.');
  io.out('');
  io.out(`HEAD is now at ${shortId(sha)} ${firstLine(repo.commits[sha].message)}`);
  io.touch('graph', 'head', 'workdir', 'index');
  io.say('Detached HEAD: you are standing on a commit, not on a branch. New commits are not attached to any branch name.');
}

export function cmdBranch(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const del = hasFlag(parsed, '-d', '--delete');
  const forceDelete = hasFlag(parsed, '-D');
  const move = hasFlag(parsed, '-m', '-M');
  const showAll = hasFlag(parsed, '-a', '--all');
  const verbose = hasFlag(parsed, '-v', '--verbose');

  if (del || forceDelete) {
    if (!parsed.positionals.length) {
      io.err('fatal: branch name required');
      return;
    }
    for (const name of parsed.positionals) {
      if (!(name in repo.branches)) {
        io.err(`error: branch '${name}' not found.`);
        continue;
      }
      if (repo.head.branch === name) {
        io.err(`error: Cannot delete branch '${name}' checked out at '${repo.dir}'`);
        io.say('Switch to another branch before deleting this one.');
        continue;
      }
      if (!forceDelete && repo.head.commit && !isAncestor(repo, repo.branches[name], repo.head.commit)) {
        io.err(`error: The branch '${name}' is not fully merged.`);
        io.muted(`hint: If you are sure you want to delete it, run 'git branch -D ${name}'.`);
        io.say('Git protects unmerged work. Use -D only when you really mean to lose it.');
        continue;
      }
      const was = shortId(repo.branches[name]);
      deleteBranch(repo, name);
      io.out(`Deleted branch ${name} (was ${was}).`);
      io.touch('graph');
      io.say('Only the branch label was removed. The commits themselves stay in the object database until garbage collection.');
    }
    return;
  }

  if (move) {
    const names = parsed.positionals;
    const oldName = names.length > 1 ? names[0] : repo.head.branch;
    const newName = names.length > 1 ? names[1] : names[0];
    if (!oldName) {
      io.err('fatal: no branch to rename');
      return;
    }
    if (!(oldName in repo.branches)) {
      io.err(`error: refname refs/heads/${oldName} not found`);
      return;
    }
    if (newName in repo.branches) {
      io.err(`fatal: a branch named '${newName}' already exists`);
      return;
    }
    if (!newName) {
      io.err('fatal: new branch name required');
      return;
    }
    repo.branches[newName] = repo.branches[oldName];
    delete repo.branches[oldName];
    if (repo.head.branch === oldName) repo.head.branch = newName;
    io.touch('graph');
    io.say(`Renamed the branch pointer from "${oldName}" to "${newName}". The commits did not change.`);
    return;
  }

  if (parsed.positionals.length) {
    const name = parsed.positionals[0];
    const startSpec = parsed.positionals[1];
    if (name in repo.branches) {
      io.err(`fatal: a branch named '${name}' already exists`);
      return;
    }
    const sha = startSpec ? resolveRef(repo, startSpec) : repo.head.commit;
    if (!sha) {
      io.err(`fatal: not a valid object name: '${startSpec ?? 'HEAD'}'`);
      io.say('Create a commit first — every branch must point at a commit.');
      return;
    }
    repo.branches[name] = sha;
    io.touch('graph');
    io.say(
      `Created branch "${name}" at ${shortId(sha)}. You are still on "${currentLabel(repo)}"; switch to it with \`git switch ${name}\`.`,
    );
    return;
  }

  const current = repo.head.branch;
  const lines: string[] = [];
  for (const name of Object.keys(repo.branches).sort()) {
    const commit = repo.commits[repo.branches[name]];
    const suffix = verbose && commit ? ` ${shortId(commit.id)} ${firstLine(commit.message)}` : '';
    lines.push(`${name === current ? '*' : ' '} ${name}${suffix}`);
  }
  if (showAll) {
    for (const remote of Object.values(repo.remotes)) {
      for (const name of Object.keys(remote.tracking).sort()) {
        const sha = remote.tracking[name];
        const commit = repo.commits[sha];
        const suffix = verbose && commit ? ` ${shortId(commit.id)} ${firstLine(commit.message)}` : '';
        lines.push(`  remotes/${remote.name}/${name}${suffix}`);
      }
    }
  }
  if (lines.length) io.out(lines.join('\n'));
  io.say('The * marks the branch HEAD is attached to. Branches are just named pointers to commits.');
}

export function cmdMerge(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);

  if (hasFlag(parsed, '--abort')) {
    if (!repo.mergeState) {
      io.err('fatal: There is no merge to abort (MERGE_HEAD missing).');
      return;
    }
    const head = headSnapshot(repo);
    installSnapshot(repo, head, head);
    repo.mergeState = null;
    repo.conflicts = [];
    io.touch('workdir', 'index', 'graph');
    io.say('The merge was aborted and the working tree returned to the last commit.');
    return;
  }

  const spec = parsed.positionals[0];
  if (!spec) {
    io.err('fatal: No remote for the current branch.');
    io.say('Tell merge which branch to bring in, e.g. `git merge feature`.');
    return;
  }
  const target = resolveRef(repo, spec);
  if (!target) {
    io.err(`merge: ${spec} - not something we can merge`);
    return;
  }
  if (repo.mergeState) {
    io.err('error: You have not concluded your merge (MERGE_HEAD exists).');
    io.muted('hint: Please, commit your changes before merging.');
    return;
  }

  const label = spec in repo.branches ? spec : shortId(target);
  performMerge(repo, target, label, io, hasFlag(parsed, '--no-ff'));
}

export function performMerge(
  repo: Repo,
  target: string,
  label: string,
  io: Io,
  noFf = false,
): void {
  const head = repo.head.commit;
  const previousHead = headSnapshot(repo);

  if (!head) {
    const failure = checkoutSnapshot(repo, snapshotOf(repo, target));
    if (failure) {
      printCheckoutFailure(failure, io);
      return;
    }
    if (repo.head.branch) repo.branches[repo.head.branch] = target;
    repo.head.commit = target;
    recordReflog(repo, `merge ${label}: Fast-forward`);
    io.out(`Fast-forward`);
    io.touch('head', 'workdir', 'index', 'graph');
    io.say('The empty branch simply moved forward to the target commit.');
    return;
  }

  if (target === head || isAncestor(repo, target, head)) {
    io.out('Already up to date.');
    io.say(`${label} is already fully contained in your current branch.`);
    return;
  }

  const fastForward = isAncestor(repo, head, target) && !noFf;
  if (fastForward) {
    const failure = checkoutSnapshot(repo, snapshotOf(repo, target));
    if (failure) {
      printCheckoutFailure(failure, io);
      return;
    }
    if (repo.head.branch) repo.branches[repo.head.branch] = target;
    repo.head.commit = target;
    recordReflog(repo, `merge ${label}: Fast-forward`);
    io.out(`Updating ${shortId(head)}..${shortId(target)}`);
    io.out('Fast-forward');
    const stats = statsText(previousHead, snapshotOf(repo, target));
    if (stats) io.muted(` ${stats}`);
    io.touch('head', 'workdir', 'index', 'graph');
    io.say(
      'Fast-forward: the current branch had no new commits, so Git simply slid the branch pointer forward. No merge commit was needed.',
    );
    return;
  }

  const base = mergeBase(repo, head, target);
  const merged = mergeSnapshots(
    snapshotOf(repo, base),
    previousHead,
    snapshotOf(repo, target),
    label,
  );

  if (!merged.clean) {
    installSnapshot(repo, merged.snapshot, previousHead);
    repo.conflicts = merged.conflicts;
    repo.mergeState = {
      target,
      targetLabel: label,
      base,
      origHead: head,
    };
    for (const path of merged.conflicts) {
      io.out(`Auto-merging ${path}`);
      io.err(`CONFLICT (content): Merge conflict in ${path}`);
    }
    io.err('Automatic merge failed; fix conflicts and then commit the result.');
    io.touch('workdir', 'index', 'graph');
    io.say(
      'Both branches changed the same lines. Git wrote conflict markers into the files: edit them, remove <<<<<<< ======= >>>>>>>, then `git add` and `git commit`.',
    );
    return;
  }

  const message = `Merge branch '${label}' into ${repo.head.branch ?? 'HEAD'}`;
  const commit = commitToHead(repo, message, [target], merged.snapshot);
  installSnapshot(repo, merged.snapshot, previousHead);
  io.out("Merge made by the 'ort' strategy.");
  const stats = statsText(previousHead, merged.snapshot);
  if (stats) io.muted(` ${stats}`);
  io.touch('head', 'workdir', 'index', 'graph');
  io.say(
    `A merge commit (${shortId(commit.id)}) was created. It has two parents, so history records both lines of development joining.`,
  );
}

export function cmdRebase(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);

  if (hasFlag(parsed, '--abort')) {
    if (!repo.rebaseState) {
      io.err('fatal: No rebase in progress?');
      return;
    }
    const onto = repo.rebaseState.onto;
    if (repo.head.branch) repo.branches[repo.head.branch] = onto;
    repo.head.commit = onto;
    installSnapshot(repo, snapshotOf(repo, onto), snapshotOf(repo, onto));
    repo.rebaseState = null;
    io.touch('head', 'graph', 'workdir', 'index');
    io.say('The rebase was aborted.');
    return;
  }

  const spec = parsed.positionals[0];
  if (!spec) {
    io.err('fatal: no upstream branch given');
    io.say('Rebase needs a destination, e.g. `git rebase main`.');
    return;
  }
  const onto = resolveRef(repo, spec);
  if (!onto) {
    io.err(`fatal: invalid upstream '${spec}'`);
    return;
  }
  if (!repo.head.branch || !repo.head.commit) {
    io.err('fatal: You are not currently on a branch.');
    io.say('Switch to a branch first: `git switch feature`.');
    return;
  }
  if (repo.mergeState) {
    io.err('error: cannot rebase: You have unmerged files.');
    return;
  }

  const branch = repo.head.branch;
  const head = repo.head.commit;

  if (head === onto || isAncestor(repo, onto, head)) {
    io.out(`Current branch ${branch} is up to date.`);
    io.say(`${spec} is already part of this branch, so there is nothing to replay.`);
    return;
  }

  if (isAncestor(repo, head, onto)) {
    const previousHead = headSnapshot(repo);
    const failure = checkoutSnapshot(repo, snapshotOf(repo, onto));
    if (failure) {
      printCheckoutFailure(failure, io);
      return;
    }
    repo.branches[branch] = onto;
    repo.head.commit = onto;
    recordReflog(repo, `rebase (finish): refs/heads/${branch} onto ${spec}`);
    io.out(`Fast-forwarded ${branch} to ${spec}.`);
    io.touch('head', 'workdir', 'index', 'graph');
    const stats = statsText(previousHead, snapshotOf(repo, onto));
    if (stats) io.muted(` ${stats}`);
    io.say('The branch had no unique commits, so it simply moved forward.');
    return;
  }

  const targetAncestors = ancestors(repo, onto);
  const replay = [...ancestors(repo, head)]
    .filter((id) => !targetAncestors.has(id))
    .map((id) => repo.commits[id])
    .filter((commit) => commit.parents.length <= 1)
    .sort((a, b) => a.time - b.time);

  if (!replay.length) {
    io.out(`Current branch ${branch} is up to date.`);
    return;
  }

  const previousHead = headSnapshot(repo);
  let baseSha = onto;
  let baseSnapshot = snapshotOf(repo, onto);

  for (const commit of replay) {
    const snapshot = applyCommitDiff(repo, baseSnapshot, commit);
    const replayed = createCommit(
      repo,
      commit.message,
      snapshot,
      [baseSha],
      commit.author,
    );
    if (repo.head.branch) repo.branches[repo.head.branch] = replayed.id;
    repo.head.commit = replayed.id;
    baseSha = replayed.id;
    baseSnapshot = snapshot;
  }

  if (repo.head.branch) repo.branches[repo.head.branch] = baseSha;
  repo.head.commit = baseSha;
  installSnapshot(repo, baseSnapshot, previousHead);
  recordReflog(repo, `rebase (finish): refs/heads/${branch} onto ${spec}`);
  io.out(`Successfully rebased and updated refs/heads/${branch}.`);
  io.touch('head', 'workdir', 'index', 'graph');
  io.say(
    `Each unique commit was copied on top of "${spec}" to produce a straight line of history. The originals still exist but are no longer reachable from this branch.`,
  );
}


