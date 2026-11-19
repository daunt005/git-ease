import type { Task } from './types.ts';
import { deleteBranch, isAncestor } from '../engine/repo.ts';
import { firstIndexOf, used } from './check.ts';
import {
  cloneFrom,
  countReachable,
  hasMarkers,
  labRepo,
  presetFrom,
  put,
  seedBranch,
  seedCommit,
  switchTo,
  teammatePush,
} from './scenario.ts';

const TEAM_URL = 'https://github.com/you/team-site.git';
const APP_V1 = 'const app = "v1";\n';
const APP_V2 = 'const app = "v1";\nconst feature = true;\n';

function teamPreset() {
  const source = labRepo();
  seedCommit(source, 'Create team site', {
    'index.html': '<h1>Team site</h1>\n',
    'app.js': 'console.log("site");\n',
  });
  seedCommit(source, 'Add stylesheet', {
    'style.css': 'body { margin: 0; }\n',
  });
  return presetFrom(source);
}

export const advancedTasks: Task[] = [
  {
    id: 'a1-conflict',
    title: 'Merge under fire',
    tagline: 'conflict markers · add · commit',
    difficulty: 2,
    story:
      'Both branches edited the same headline. Git will stop mid-merge and leave conflict markers in index.html. Only you can decide what the final sentence should be.',
    goal: 'Merge feature/hero into main, resolve the conflict so index.html has no markers, then commit the merge.',
    concepts: ['merge conflict', 'conflict markers', 'resolving with git add'],
    hints: [
      'On main, run `git merge feature/hero`. Git will report a CONFLICT and stop.',
      'Open index.html from the Files panel. Remove the <<<<<<<, ======= and >>>>>>> lines and write one final headline.',
      '`git add index.html` marks it resolved, then `git commit -m "Merge feature/hero"` (or just `git commit`) finishes the merge.',
    ],
    solution: [
      'git merge feature/hero',
      'git add index.html',
      'git commit -m "Merge feature/hero"',
    ],
    setup: () => {
      const repo = labRepo({ 'index.html': '<h1>Welcome</h1>\n' });
      seedCommit(repo, 'Initial page', { 'index.html': '<h1>Welcome</h1>\n' });
      seedBranch(repo, 'feature/hero');
      seedCommit(repo, 'Feature headline', {
        'index.html': '<h1>Welcome to my blog</h1>\n',
      });
      switchTo(repo, 'main');
      seedCommit(repo, 'Main headline', { 'index.html': '<h1>Welcome home</h1>\n' });
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        used(ctx, /^git merge/) &&
        repo.conflicts.length === 0 &&
        !!head &&
        head.parents.length === 2 &&
        !hasMarkers(repo.workdir['index.html']) &&
        !hasMarkers(head.snapshot['index.html'])
      );
    },
  },
  {
    id: 'a2-unstage',
    title: 'Take it back out',
    tagline: 'git restore --staged · reset HEAD',
    difficulty: 2,
    story:
      'You staged everything in a hurry. secret.env slipped in with the real change. The commit is not made yet — unstage the secret, keep app.js, then commit.',
    goal: 'Unstage secret.env, keep its file on disk, and commit only the app.js change.',
    concepts: ['unstaging', 'restore --staged', 'commit contents'],
    hints: [
      '`git restore --staged secret.env` removes it from the index without touching the file.',
      '`git reset HEAD secret.env` is the older spelling of the same thing.',
      'Then commit. Verify with `git status` that secret.env is untracked again.',
    ],
    solution: ['git restore --staged secret.env', 'git status', 'git commit -m "Add feature flag"'],
    setup: () => {
      const repo = labRepo({ 'app.js': APP_V1 });
      seedCommit(repo, 'Add app', { 'app.js': APP_V1 });
      put(repo, { 'app.js': APP_V2, 'secret.env': 'API_KEY=123\n' });
      repo.index = { 'app.js': APP_V2, 'secret.env': 'API_KEY=123\n' };
      return repo;
    },
    check: (repo) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        !!head &&
        head.snapshot['app.js'] === APP_V2 &&
        !('secret.env' in head.snapshot) &&
        !('secret.env' in repo.index) &&
        repo.workdir['secret.env'] === 'API_KEY=123\n'
      );
    },
  },
  {
    id: 'a3-soft-reset',
    title: 'Rewind, keep the work',
    tagline: 'git reset --soft HEAD~1',
    difficulty: 2,
    story:
      'The last commit message is just "temp". You want to redo that commit properly, without losing the contact page you already wrote.',
    goal: 'Undo the last commit while keeping its changes staged, then recommit with the message "Add contact page".',
    concepts: ['reset --soft', 'rewriting the last commit', 'staged changes'],
    hints: [
      '`git reset --soft HEAD~1` moves the branch back one commit but leaves the index alone.',
      '`git status` should show contact.html staged.',
      'Recommit: `git commit -m "Add contact page"`.',
      'Bonus: compare with `--mixed` (unstages) and `--hard` (throws changes away).',
    ],
    solution: ['git reset --soft HEAD~1', 'git status', 'git commit -m "Add contact page"'],
    setup: () => {
      const repo = labRepo({ 'index.html': '<h1>Home</h1>\n' });
      seedCommit(repo, 'Add homepage', { 'index.html': '<h1>Home</h1>\n' });
      seedCommit(repo, 'temp', { 'contact.html': '<h1>Contact</h1>\n' });
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        used(ctx, /git reset\b.*--soft/) &&
        !!head &&
        countReachable(repo) === 2 &&
        head.message.trim().toLowerCase() === 'add contact page' &&
        'contact.html' in head.snapshot &&
        repo.index['contact.html'] === head.snapshot['contact.html']
      );
    },
  },
  {
    id: 'a4-revert',
    title: 'Undo in public',
    tagline: 'git revert <commit>',
    difficulty: 2,
    story:
      'A commit in the middle of history broke the login screen. Other people already pulled it, so deleting history would cause chaos. Reverse it with a new commit instead.',
    goal: 'Revert the "Break login" commit. app.js must be healthy again, the bad commit must still exist, and history should grow to 4 commits.',
    concepts: ['revert', 'inverse commit', 'shared history'],
    hints: [
      'Find the bad commit with `git log --oneline`.',
      '`git revert <sha>` creates a new commit that reverses it. Use the short hash.',
      'Confirm with `git log --oneline`: the bad commit remains, followed by "Revert ...".',
    ],
    solution: ['git log --oneline', 'git revert HEAD~1'],
    setup: () => {
      const repo = labRepo({ 'app.js': 'status: ok\n' });
      seedCommit(repo, 'Initial app', { 'app.js': 'status: ok\n' });
      seedCommit(repo, 'Break login', { 'app.js': 'status: broken\n' });
      seedCommit(repo, 'Add docs', { 'README.md': '# App docs\n' });
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      const badStillExists = Object.values(repo.commits).some(
        (commit) => commit.message === 'Break login',
      );
      return (
        used(ctx, /^git revert/) &&
        !!head &&
        countReachable(repo) === 4 &&
        head.message.startsWith('Revert "Break login"') &&
        repo.workdir['app.js'] === 'status: ok\n' &&
        badStillExists
      );
    },
  },
  {
    id: 'a5-stash',
    title: 'Park it, fix it, resume',
    tagline: 'git stash · pop',
    difficulty: 3,
    story:
      'You are halfway through a feature with unsaved edits. Production needs a hotfix on main right now. Park the work, fix main, then come back and unpark it.',
    goal: 'Stash the feature edit, switch to main and commit a hotfix.txt file, return to feature, pop the stash, and commit the feature work.',
    concepts: ['stash', 'stash pop', 'switching with a clean tree'],
    hints: [
      '`git stash` saves the uncommitted edit and resets your files to the last commit.',
      '`git switch main`, create `hotfix.txt`, stage it, `git commit -m "Add hotfix"`.',
      '`git switch feature` then `git stash pop` restores the edit.',
      'Finish with `git add app.js` and `git commit -m "Finish feature work"`.',
    ],
    solution: [
      'git stash',
      'git switch main',
      'echo "fixed" > hotfix.txt',
      'git add hotfix.txt',
      'git commit -m "Add hotfix"',
      'git switch feature',
      'git stash pop',
      'git add app.js',
      'git commit -m "Finish feature work"',
    ],
    setup: () => {
      const repo = labRepo({ 'app.js': APP_V1 });
      seedCommit(repo, 'Initial app', { 'app.js': APP_V1 });
      seedBranch(repo, 'feature');
      put(repo, { 'app.js': `${APP_V1}const wip = "feature work";\n` });
      return repo;
    },
    check: (repo, ctx) => {
      const mainSha = repo.branches.main;
      const featureSha = repo.branches.feature;
      const mainSnap = mainSha ? repo.commits[mainSha].snapshot : {};
      const featureSnap = featureSha ? repo.commits[featureSha].snapshot : {};
      const featureMsg = featureSha ? repo.commits[featureSha].message : '';
      return (
        used(ctx, /^git stash(?!\s+(pop|apply|list|show|drop|clear))/) &&
        used(ctx, /^git stash pop/) &&
        repo.stash.length === 0 &&
        'hotfix.txt' in mainSnap &&
        featureSnap['app.js'] === `${APP_V1}const wip = "feature work";\n` &&
        featureMsg === 'Finish feature work'
      );
    },
  },
  {
    id: 'a6-cherry-pick',
    title: 'Copy one fix',
    tagline: 'git cherry-pick <commit>',
    difficulty: 2,
    story:
      'The release branch has a login fix that main desperately needs, but release also contains unfinished experiments. Take only the fix.',
    goal: 'Cherry-pick the "Fix login redirect" commit from release onto main. release must stay where it is.',
    concepts: ['cherry-pick', 'copied commit', 'new hash'],
    hints: [
      'Inspect the release branch: `git log release --oneline`.',
      '`git cherry-pick <sha>` copies that commit’s changes onto your current branch.',
      'The copy gets a new hash because its parent is different.',
    ],
    solution: ['git log release --oneline', 'git cherry-pick <sha-of-Fix-login-redirect>'],
    setup: () => {
      const repo = labRepo({ 'app.js': 'login: broken\n' });
      seedCommit(repo, 'Initial app', { 'app.js': 'login: broken\n' });
      seedBranch(repo, 'release');
      seedCommit(repo, 'Fix login redirect', { 'app.js': 'login: fixed\n' });
      switchTo(repo, 'main');
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      const releaseSnap = repo.branches.release
        ? repo.commits[repo.branches.release].snapshot
        : {};
      return (
        used(ctx, /^git cherry-pick/) &&
        !!head &&
        head.message === 'Fix login redirect' &&
        head.snapshot['app.js'] === 'login: fixed\n' &&
        releaseSnap['app.js'] === 'login: fixed\n' &&
        repo.branches.main !== repo.branches.release
      );
    },
  },
  {
    id: 'a7-rebase',
    title: 'Draw a straight line',
    tagline: 'git rebase · then merge',
    difficulty: 3,
    story:
      'Your feature works, but main moved on while you were building it. Instead of a tangle of merge commits, replay your work on top of main, then fast-forward main.',
    goal: 'Rebase feature onto main, then switch to main and merge feature. History must contain no merge commits.',
    concepts: ['rebase', 'linear history', 'replaying commits'],
    hints: [
      'On feature, run `git rebase main`. Your two commits are copied on top of main.',
      '`git log --oneline --graph --all` should show one straight line now.',
      '`git switch main` then `git merge feature`: it becomes a fast-forward.',
      'Rebase rewrites commit hashes. Do not rebase commits others already pulled.',
    ],
    solution: ['git rebase main', 'git switch main', 'git merge feature'],
    setup: () => {
      const repo = labRepo({ 'app.js': 'v1\n' });
      seedCommit(repo, 'Initial app', { 'app.js': 'v1\n' });
      seedBranch(repo, 'feature');
      seedCommit(repo, 'Add search', { 'search.js': 'search();\n' });
      seedCommit(repo, 'Style search', { 'styles.css': '.search { color: teal; }\n' });
      switchTo(repo, 'main');
      seedCommit(repo, 'Update dependencies', { 'package.json': '{"name":"app"}\n' });
      switchTo(repo, 'feature');
      return repo;
    },
    check: (repo, ctx) => {
      if (!used(ctx, /^git rebase/) || !used(ctx, /^git merge/)) return false;
      if (!repo.branches.main || repo.branches.main !== repo.branches.feature) return false;
      const head = repo.head.commit;
      if (!head) return false;
      const initialMain = ctx.initial.branches.main;
      if (initialMain && !isAncestor(repo, initialMain, head)) return false;
      const seen = new Set<string>();
      const stack = [head];
      while (stack.length) {
        const id = stack.pop() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const commit = repo.commits[id];
        if (!commit) continue;
        if (commit.parents.length > 1) return false;
        stack.push(...commit.parents);
      }
      return true;
    },
  },
  {
    id: 'a8-tag',
    title: 'Plant a flag',
    tagline: 'git tag -a',
    difficulty: 1,
    story:
      'Version 1.0.0 is ready. Branches move; tags do not. Mark this exact commit so you can always find the release again.',
    goal: 'Create an annotated tag named v1.0.0 on HEAD. Then list tags.',
    concepts: ['tags', 'annotated tag', 'release labels'],
    hints: [
      'Annotated tags carry a message: `git tag -a v1.0.0 -m "First release"`.',
      'List them with `git tag`.',
      'Tags are not pushed automatically; real projects use `git push --tags`.',
    ],
    solution: ['git tag -a v1.0.0 -m "First release"', 'git tag'],
    setup: () => {
      const repo = labRepo({ 'app.js': APP_V1 });
      seedCommit(repo, 'Initial app', { 'app.js': APP_V1 });
      seedCommit(repo, 'Add feature flag', { 'app.js': APP_V2 });
      return repo;
    },
    check: (repo, ctx) =>
      used(ctx, /^git tag\s+-a/) &&
      !!repo.head.commit &&
      repo.tags['v1.0.0'] === repo.head.commit,
  },
  {
    id: 'a9-reflog',
    title: 'Resurrect a branch',
    tagline: 'git reflog · git branch <name> <sha>',
    difficulty: 2,
    story:
      'The pricing branch was deleted by mistake. No branch points at its commit anymore, but the reflog still remembers where HEAD has been.',
    goal: 'Recreate the branch pricing at the "Add pricing page" commit, using the reflog to find it.',
    concepts: ['reflog', 'dangling commits', 'recovering work'],
    hints: [
      '`git reflog` lists every place HEAD has been, with commit hashes.',
      'Look for the checkout away from pricing, or the deletion line with its hash.',
      'Recreate the branch with `git branch pricing <sha>`. You can also use `git switch -c pricing <sha>`.',
    ],
    solution: ['git reflog', 'git branch pricing <sha>', 'git branch'],
    setup: () => {
      const repo = labRepo({ 'index.html': '<h1>Home</h1>\n' });
      seedCommit(repo, 'Initial commit', { 'index.html': '<h1>Home</h1>\n' });
      seedBranch(repo, 'pricing');
      seedCommit(repo, 'Add pricing page', { 'pricing.html': '<h1>Pricing</h1>\n' });
      switchTo(repo, 'main');
      deleteBranch(repo, 'pricing');
      return repo;
    },
    check: (repo, ctx) => {
      const sha = repo.branches.pricing;
      if (!sha) return false;
      return (
        used(ctx, /^git reflog/) &&
        used(ctx, /^git (branch|switch|checkout)/) &&
        repo.commits[sha]?.message === 'Add pricing page'
      );
    },
  },
  {
    id: 'a10-diverged-push',
    title: 'Rejected!',
    tagline: 'push · pull --rebase · push',
    difficulty: 3,
    story:
      'You committed locally, but a teammate pushed meanwhile. Your push bounces. Integrate their work on top of yours with a rebase, then try again.',
    goal: 'Make the first push fail, run git pull --rebase, then push successfully. The remote must contain both changes.',
    concepts: ['diverged history', 'non-fast-forward', 'pull --rebase'],
    hints: [
      'Try `git push`. Git rejects it because origin/main has a commit you do not have.',
      '`git pull --rebase` fetches and replays your local commit on top of the teammate commit.',
      'Push again. `git log --oneline --all` should show both changes as one straight line.',
    ],
    solution: ['git push', 'git pull --rebase', 'git push'],
    setup: () => {
      const repo = cloneFrom(teamPreset(), TEAM_URL, 'team-site');
      seedCommit(repo, 'Draft local tweak', { 'local.txt': 'my local change\n' });
      teammatePush(repo, 'main', { 'remote.txt': 'teammate change\n' }, 'Add changelog');
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      const pushes = ctx.history.filter((command) => /^git push/.test(command.trim()));
      const pullIndex = firstIndexOf(ctx, /^git pull\b.*--rebase/);
      const lastPushIndex = ctx.history.reduce(
        (last, command, index) => (/^git push/.test(command.trim()) ? index : last),
        -1,
      );
      return (
        pushes.length >= 2 &&
        pullIndex >= 0 &&
        lastPushIndex > pullIndex &&
        !!head &&
        repo.remotes.origin?.server.main === repo.branches.main &&
        head.snapshot['local.txt'] === 'my local change\n' &&
        head.snapshot['remote.txt'] === 'teammate change\n'
      );
    },
  },
  {
    id: 'a11-amend',
    title: 'Fix the label',
    tagline: 'git commit --amend',
    difficulty: 1,
    story:
      'The last commit is perfect except for one typo in its message: "contatc". Since nobody has pulled it, you can rewrite it.',
    goal: 'Amend the last commit so its message is exactly "Add contact page". Do not add a new commit.',
    concepts: ['amend', 'rewriting the last commit', 'hash changes'],
    hints: [
      '`git commit --amend -m "Add contact page"` replaces the last commit.',
      'The commit count stays the same, but the hash changes because the message is part of the commit.',
      'Use `git log --oneline` to check.',
    ],
    solution: ['git commit --amend -m "Add contact page"', 'git log --oneline'],
    setup: () => {
      const repo = labRepo({ 'index.html': '<h1>Home</h1>\n' });
      seedCommit(repo, 'Add homepage', { 'index.html': '<h1>Home</h1>\n' });
      seedCommit(repo, 'Add contatc page', { 'contact.html': '<h1>Contact</h1>\n' });
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        used(ctx, /--amend/) &&
        !!head &&
        head.message.trim() === 'Add contact page' &&
        countReachable(repo) === 2
      );
    },
  },
  {
    id: 'a12-discard',
    title: 'Throw it away',
    tagline: 'git restore <file>',
    difficulty: 2,
    story:
      'You were experimenting with style.css and hate it. app.js, however, has a real change that is already staged. Discard only the experiment, then commit the real work.',
    goal: 'Discard the unstaged change to style.css, keep the staged app.js change, and commit it.',
    concepts: ['discard changes', 'restore vs restore --staged', 'unrecoverable edits'],
    hints: [
      '`git restore style.css` overwrites the file with the index version. The edit is not recoverable.',
      'Do not use --staged here: the app.js change must stay staged.',
      'Then `git commit -m "Add feature flag"`.',
    ],
    solution: ['git restore style.css', 'git status', 'git commit -m "Add feature flag"'],
    setup: () => {
      const repo = labRepo({ 'app.js': APP_V1, 'style.css': 'body { color: black; }\n' });
      seedCommit(repo, 'Initial app', {
        'app.js': APP_V1,
        'style.css': 'body { color: black; }\n',
      });
      put(repo, {
        'app.js': APP_V2,
        'style.css': 'body { color: hotpink; font-size: 80px; }\n',
      });
      repo.index = { ...repo.commits[repo.head.commit as string].snapshot, 'app.js': APP_V2 };
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        used(ctx, /^git (restore|checkout)\b/) &&
        !used(ctx, /--staged/) &&
        !!head &&
        head.snapshot['app.js'] === APP_V2 &&
        head.snapshot['style.css'] === 'body { color: black; }\n' &&
        repo.workdir['style.css'] === 'body { color: black; }\n'
      );
    },
  },
];
