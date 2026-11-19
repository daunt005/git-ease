import type { Io, Repo } from '../types.ts';
import { ensureRepo, parseArgs, hasFlag } from '../io.ts';
import { ancestors, isAncestor } from '../repo.ts';
import { cmdRebase, performMerge } from './branches.ts';
import { shortId } from '../util.ts';

function remoteUrlSuggestions(repo: Repo): string[] {
  return Object.keys(repo.presets);
}

export function cmdClone(repo: Repo, args: string[], io: Io): void {
  const parsed = parseArgs(args);
  const url = parsed.positionals[0];
  if (!url) {
    io.err('fatal: You must specify a repository to clone.');
    io.say('Usage: `git clone <url>`, for example `git clone https://github.com/you/my-blog.git`.');
    return;
  }

  const preset =
    repo.presets[url] ??
    repo.presets[url.replace(/\.git$/, '')] ??
    repo.presets[`${url}.git`];

  if (!preset) {
    io.err(`fatal: repository '${url}' does not exist`);
    const options = remoteUrlSuggestions(repo);
    if (options.length) {
      io.muted('Available repositories in this lab:');
      for (const option of options) io.muted(`  ${option}`);
    }
    io.say('Copy one of the available URLs exactly, including the https:// part.');
    return;
  }

  const remoteBranches = preset.branches;
  const branch = 'main' in remoteBranches ? 'main' : Object.keys(remoteBranches)[0];
  if (!branch) {
    io.err('warning: You appear to have cloned an empty repository.');
    repo.initialized = true;
    repo.remotes.origin = {
      name: 'origin',
      url,
      tracking: {},
      server: {},
      tags: {},
    };
    return;
  }

  const sha = remoteBranches[branch];
  const snapshot = preset.commits[sha]?.snapshot ?? {};
  const folder = parsed.positionals[1] ?? (url.replace(/\/$/, '').split('/').pop() ?? 'project').replace(/\.git$/, '');
  const count = Object.keys(preset.commits).length;

  repo.initialized = true;
  repo.dir = `~/${folder}`;
  repo.commits = structuredClone(preset.commits);
  repo.branches = { [branch]: sha };
  repo.tags = {};
  repo.head = { branch, commit: sha };
  repo.index = { ...snapshot };
  repo.workdir = { ...snapshot };
  repo.stash = [];
  repo.conflicts = [];
  repo.mergeState = null;
  repo.rebaseState = null;
  repo.remotes = {
    origin: {
      name: 'origin',
      url,
      tracking: { ...remoteBranches },
      server: { ...remoteBranches },
      tags: {},
    },
  };
  repo.clock = Math.max(
    repo.clock,
    ...Object.values(preset.commits).map((commit) => commit.time),
  );
  repo.reflog = [{ head: sha, branch, message: `clone: from ${url}` }];

  io.out(`Cloning into '${folder}'...`);
  io.out(`remote: Enumerating objects: ${count}, done.`);
  io.out(`remote: Counting objects: 100% (${count}/${count}), done.`);
  io.out(`remote: Compressing objects: 100% (${count}/${count}), done.`);
  io.out(`remote: Total ${count} (delta 0), reused 0 (delta 0), pack-reused 0`);
  io.out(`Receiving objects: 100% (${count}/${count}), done.`);
  io.touch('workdir', 'index', 'head', 'graph', 'remote');
  io.say(
    `Clone copied the whole history, checked out "${branch}", and remembered the source as the remote "origin" with a tracking branch "origin/${branch}".`,
  );
}

export function cmdRemote(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const verbose = hasFlag(parsed, '-v', '--verbose');
  const sub = parsed.positionals[0];
  const remotes = Object.values(repo.remotes);

  if (!sub) {
    if (verbose) {
      const lines: string[] = [];
      for (const remote of remotes) {
        lines.push(`${remote.name}\t${remote.url} (fetch)`);
        lines.push(`${remote.name}\t${remote.url} (push)`);
      }
      if (lines.length) io.out(lines.join('\n'));
    } else if (remotes.length) {
      io.out(remotes.map((remote) => remote.name).join('\n'));
    }
    io.say('A remote is a short name for a URL where another copy of the repository lives.');
    return;
  }

  if (sub === 'add') {
    const name = parsed.positionals[1];
    const url = parsed.positionals[2];
    if (!name || !url) {
      io.err('usage: git remote add <name> <url>');
      return;
    }
    if (name in repo.remotes) {
      io.err(`error: remote ${name} already exists.`);
      return;
    }
    repo.remotes[name] = { name, url, tracking: {}, server: {}, tags: {} };
    io.touch('remote');
    io.say(`Remote "${name}" now points at ${url}. Nothing has been downloaded yet — use \`git fetch ${name}\`.`);
    return;
  }

  if (sub === 'remove' || sub === 'rm') {
    const name = parsed.positionals[1];
    if (!name || !(name in repo.remotes)) {
      io.err(`error: No such remote: '${name ?? ''}'`);
      return;
    }
    delete repo.remotes[name];
    io.touch('remote');
    io.say('The remote nickname and its tracking branches were removed locally. The server is untouched.');
    return;
  }

  if (sub === 'get-url') {
    const name = parsed.positionals[1];
    const remote = name ? repo.remotes[name] : undefined;
    if (!remote) {
      io.err(`fatal: No such remote '${name ?? ''}'`);
      return;
    }
    io.out(remote.url);
    return;
  }

  if (verbose) {
    for (const remote of remotes) {
      io.out(`${remote.name}\t${remote.url} (fetch)`);
      io.out(`${remote.name}\t${remote.url} (push)`);
    }
  } else if (remotes.length) {
    io.out(remotes.map((remote) => remote.name).join('\n'));
  }
}

export function performFetch(repo: Repo, remoteName: string, io: Io): number {
  const remote = repo.remotes[remoteName];
  if (!remote) {
    io.err(`fatal: '${remoteName}' does not appear to be a git repository`);
    io.muted('fatal: Could not read from remote repository.');
    io.say('Check the remote name with `git remote -v`.');
    return -1;
  }

  let updates = 0;
  const lines: string[] = [];
  for (const branch of Object.keys(remote.server).sort()) {
    const serverSha = remote.server[branch];
    const trackingSha = remote.tracking[branch];
    if (serverSha === trackingSha) continue;
    lines.push(
      trackingSha
        ? `   ${shortId(trackingSha)}..${shortId(serverSha)}  ${branch} -> ${remoteName}/${branch}`
        : ` * [new branch]      ${branch} -> ${remoteName}/${branch}`,
    );
    remote.tracking[branch] = serverSha;
    updates++;
  }

  if (updates) {
    io.out(`From ${remote.url}`);
    for (const line of lines) io.out(line);
    io.touch('graph', 'remote');
    io.say(
      `Fetched ${updates} updated ref${updates === 1 ? '' : 's'} into ${remoteName}/*. Your own branches and files are untouched.`,
    );
  } else {
    io.say(`${remoteName} has no new commits — everything is already fetched.`);
  }
  return updates;
}

export function cmdFetch(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const remoteName = parsed.positionals[0] ?? 'origin';
  performFetch(repo, remoteName, io);
}

export function cmdPull(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const remoteName = parsed.positionals[0] ?? 'origin';
  const branch = parsed.positionals[1] ?? repo.head.branch;

  if (performFetch(repo, remoteName, io) < 0) return;
  if (!branch) {
    io.err('fatal: no current branch to pull into');
    return;
  }
  const remote = repo.remotes[remoteName];
  const target = remote.tracking[branch];
  if (!target) {
    io.err('There is no tracking information for the current branch.');
    io.err('Please specify which branch you want to merge with.');
    io.muted('See git-pull(1) for details.');
    io.muted(`    git pull <remote> <branch>`);
    io.say(`Use \`git pull ${remoteName} ${branch}\` or set an upstream with \`git push -u ${remoteName} ${branch}\`.`);
    return;
  }

  const label = `${remoteName}/${branch}`;
  if (hasFlag(parsed, '--rebase')) {
    cmdRebase(repo, [label], io);
  } else {
    performMerge(repo, target, label, io, false);
  }
  io.say(
    `\`git pull\` = \`git fetch\` + \`${hasFlag(parsed, '--rebase') ? 'git rebase' : 'git merge'}\`. It downloaded ${label} and integrated it into "${branch}".`,
  );
}

export function cmdPush(repo: Repo, args: string[], io: Io): void {
  if (!ensureRepo(repo, io)) return;
  const parsed = parseArgs(args);
  const force = hasFlag(parsed, '-f', '--force');
  const setTracking = hasFlag(parsed, '-u', '--set-upstream');

  const remoteName = parsed.positionals[0] ?? 'origin';
  const remote = repo.remotes[remoteName];
  if (!remote) {
    io.err('fatal: No configured push destination.');
    io.err('Either specify the URL from the command-line or configure a remote repository using');
    io.err('');
    io.err('    git remote add <name> <url>');
    io.err('');
    io.err('and then push using the remote name');
    io.err('');
    io.err(`    git push ${remoteName}`);
    io.say('Add a remote first: `git remote add origin <url>`.');
    return;
  }

  const branch = parsed.positionals[1] ?? repo.head.branch;
  if (!branch) {
    io.err('fatal: You are not currently on a branch.');
    io.muted('To push the history leading to the current (detached HEAD) state now, use');
    io.muted('');
    io.muted(`    git push ${remoteName} HEAD:<name-of-remote-branch>`);
    return;
  }
  const localSha = repo.branches[branch];
  if (!localSha) {
    io.err(`error: src refspec ${branch} does not match any`);
    io.say('There is nothing to push yet — make a commit first.');
    return;
  }

  const serverSha = remote.server[branch];
  if (serverSha === localSha) {
    io.out('Everything up-to-date');
    io.say(`The remote "${branch}" already points at ${shortId(localSha)}.`);
    return;
  }

  const fastForward = !serverSha || isAncestor(repo, serverSha, localSha);
  if (!fastForward && !force) {
    io.err(` ! [rejected]        ${branch} -> ${branch} (fetch first)`);
    io.err(`error: failed to push some refs to '${remote.url}'`);
    io.muted('hint: Updates were rejected because the remote contains work that you do');
    io.muted('hint: not have locally. This is usually caused by another repository pushing');
    io.muted('hint: to the same ref. If you want to integrate the remote changes, use');
    io.muted("hint: 'git pull' before pushing again.");
    io.muted("hint: See the 'Note about fast-forwards' in 'git push --help' for details.");
    io.say(
      'The remote has commits you do not have. Fetch and integrate them first (`git pull --rebase`), then push.',
    );
    return;
  }

  const oldTracking = remote.tracking[branch];
  remote.server[branch] = localSha;
  remote.tracking[branch] = localSha;

  const localSet = ancestors(repo, localSha);
  const serverSet = serverSha ? ancestors(repo, serverSha) : new Set<string>();
  const objectCount = Math.max(1, [...localSet].filter((id) => !serverSet.has(id)).length);

  io.out(`Enumerating objects: ${objectCount}, done.`);
  io.out(`Counting objects: 100% (${objectCount}/${objectCount}), done.`);
  io.out(`Writing objects: 100% (${objectCount}/${objectCount}), 1.2 KiB | 1.2 MiB/s, done.`);
  io.out(`Total ${objectCount} (delta 0), reused 0 (delta 0), pack-reused 0`);
  io.out(`To ${remote.url}`);
  if (!serverSha) {
    io.out(` * [new branch]      ${branch} -> ${branch}`);
  } else {
    io.out(`   ${shortId(serverSha)}..${shortId(localSha)}  ${branch} -> ${branch}`);
  }

  if (hasFlag(parsed, '--tags')) {
    for (const tag of Object.keys(repo.tags)) {
      if (!(tag in remote.tags)) {
        remote.tags[tag] = repo.tags[tag];
        io.out(` * [new tag]         ${tag} -> ${tag}`);
      }
    }
  }

  if (setTracking || !oldTracking) {
    io.out(`branch '${branch}' set up to track '${remoteName}/${branch}'.`);
  }
  io.touch('remote', 'graph');
  io.say(
    `The remote branch "${branch}" now points at ${shortId(localSha)}. Your commits left your machine and the remote-tracking ref was updated too.`,
  );
}
