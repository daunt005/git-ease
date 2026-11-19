import type { Task } from './types.ts';
import { runCommand } from '../engine/exec.ts';
import { firstIndexOf, used } from './check.ts';
import {
  cloneFrom,
  cloneLab,
  labRepo,
  presetFrom,
  put,
  seedBranch,
  seedCommit,
  switchTo,
  teammatePush,
} from './scenario.ts';

const DEMO_URL = 'https://github.com/git-ease/demo-shop.git';
const TEAM_URL = 'https://github.com/you/team-site.git';

const INDEX_V1 = '<h1>My Blog</h1>\n<p>Welcome!</p>\n';
const INDEX_V2 = '<h1>My Blog</h1>\n<p>Welcome to my blog!</p>\n';

function demoSource() {
  const source = labRepo();
  seedCommit(source, 'Create the shop homepage', {
    'README.md': '# Demo Shop\n\nA tiny storefront.\n',
    'index.html': '<h1>Demo Shop</h1>\n',
  });
  seedCommit(source, 'Add product list', {
    'products.html': '<ul><li>Mug</li><li>Sticker</li></ul>\n',
  });
  return source;
}

function teamSource(branch = 'main') {
  const source = labRepo();
  seedCommit(source, 'Create team site', {
    'index.html': '<h1>Team site</h1>\n',
    'about.html': '<h1>About us</h1>\n',
  });
  seedCommit(source, 'Add contact details', {
    'contact.txt': 'hello@team.example\n',
  });
  if (branch !== 'main') {
    switchTo(source, 'main');
  }
  return source;
}

export const beginnerTasks: Task[] = [
  {
    id: 'b1-first-repo',
    title: 'Wake the repo up',
    tagline: 'git init · git status',
    difficulty: 1,
    story:
      'You have a folder with two files and big dreams. Right now Git knows nothing about it. Turn the folder into a repository, then ask Git what it sees.',
    goal: 'Create a Git repository and run git status at least once.',
    concepts: ['repository', '.git folder', 'working tree'],
    hints: [
      'Start by creating the hidden .git folder: `git init`.',
      'Then look around with `git status`. It should list both files as untracked.',
    ],
    solution: ['git init', 'git status'],
    setup: () =>
      labRepo(
        {
          'index.html': INDEX_V1,
          'notes.txt': 'post ideas: git basics\n',
        },
        false,
      ),
    check: (repo, ctx) =>
      repo.initialized && used(ctx, /^git status/) && Object.keys(repo.commits).length === 0,
  },
  {
    id: 'b2-stage',
    title: 'Pick what goes in',
    tagline: 'git add <file> · git status',
    difficulty: 1,
    story:
      'Notes are personal; the homepage is ready. Git will not commit anything you have not explicitly staged, so choose carefully.',
    goal: 'Stage index.html only. notes.txt must stay untracked. Run git status to confirm.',
    concepts: ['staging area', 'index', 'untracked files'],
    hints: [
      'Stage a single file by name: `git add index.html`.',
      '`git add .` would swallow notes.txt too. Run `git status` after to check.',
    ],
    solution: ['git add index.html', 'git status'],
    setup: () =>
      labRepo({
        'index.html': INDEX_V1,
        'notes.txt': 'post ideas: git basics\n',
      }),
    check: (repo, ctx) =>
      repo.index['index.html'] === INDEX_V1 &&
      !('notes.txt' in repo.index) &&
      used(ctx, /^git status/),
  },
  {
    id: 'b3-first-commit',
    title: 'Freeze the moment',
    tagline: 'git commit -m "..."',
    difficulty: 1,
    story:
      'The homepage is staged. A commit is a permanent snapshot plus a message explaining why it exists.',
    goal: 'Create the first commit of this repository. notes.txt must not be in it.',
    concepts: ['commit', 'snapshot', 'commit message'],
    hints: [
      'Commit what is staged with `git commit -m "Initial commit"`.',
      'The -m flag supplies the message so Git does not open an editor.',
    ],
    solution: ['git commit -m "Initial commit"'],
    setup: () => {
      const repo = labRepo({
        'index.html': INDEX_V1,
        'notes.txt': 'post ideas: git basics\n',
      });
      repo.index = { 'index.html': INDEX_V1 };
      return repo;
    },
    check: (repo) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        !!head &&
        Object.keys(repo.commits).length === 1 &&
        head.message.trim().length > 0 &&
        !('notes.txt' in head.snapshot)
      );
    },
  },
  {
    id: 'b4-diff',
    title: 'See what changed',
    tagline: 'git diff · add · commit',
    difficulty: 1,
    story:
      'You edited the welcome line on disk. Before saving it, ask Git to show the difference between your file and the staging area.',
    goal: 'Run git diff, then stage index.html and commit the change.',
    concepts: ['working directory', 'diff', 'second commit'],
    hints: [
      '`git diff` shows unstaged changes. Look for the `+` and `-` lines.',
      'Then `git add index.html` and `git commit -m "Update welcome text"`.',
    ],
    solution: ['git diff', 'git add index.html', 'git commit -m "Update welcome text"'],
    setup: () => {
      const repo = labRepo({ 'index.html': INDEX_V1 });
      seedCommit(repo, 'Initial commit', { 'index.html': INDEX_V1 });
      put(repo, { 'index.html': INDEX_V2 });
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        !!head &&
        Object.keys(repo.commits).length === 2 &&
        head.snapshot['index.html'] === INDEX_V2 &&
        used(ctx, /^git diff/)
      );
    },
  },
  {
    id: 'b5-gitignore',
    title: 'Bouncer for files',
    tagline: '.gitignore · add · commit',
    difficulty: 2,
    story:
      'Debug logs are noise. Teach Git to ignore every *.log file, then commit that rule. debug.log is sitting in the folder and must never be tracked.',
    goal: 'Commit a .gitignore containing a *.log rule. debug.log must not be staged or committed.',
    concepts: ['.gitignore', 'ignore patterns', 'untracked vs ignored'],
    hints: [
      'Create a file named `.gitignore` (use the + button in the Files panel or `echo "*.log" > .gitignore`).',
      'Its content should be `*.log`. Then `git add .gitignore` and `git commit -m "Ignore log files"`.',
      '`git status` should no longer list debug.log at all.',
    ],
    solution: ['echo "*.log" > .gitignore', 'git add .gitignore', 'git commit -m "Ignore log files"'],
    setup: () => {
      const repo = labRepo({ 'app.js': 'console.log("hello");\n', 'debug.log': 'noise\n' });
      seedCommit(repo, 'Add app', { 'app.js': 'console.log("hello");\n' });
      put(repo, { 'debug.log': 'noise\n' });
      return repo;
    },
    check: (repo) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      if (!head) return false;
      const rules = head.snapshot['.gitignore'] ?? '';
      return (
        rules.includes('*.log') &&
        !('debug.log' in repo.index) &&
        !('debug.log' in head.snapshot)
      );
    },
  },
  {
    id: 'b6-branch',
    title: 'A safe side road',
    tagline: 'git switch -c',
    difficulty: 2,
    story:
      'You want a navigation bar, but main should stay clean until it works. Branches are cheap: make one, build there, keep main untouched.',
    goal: 'Create and switch to feature/nav. Add nav.html there and commit it. main must not contain nav.html.',
    concepts: ['branch', 'HEAD', 'isolated work'],
    hints: [
      'Create and switch in one step: `git switch -c feature/nav` (or `git checkout -b feature/nav`).',
      'Create `nav.html` with the + button or `echo "<nav>Home</nav>" > nav.html`.',
      'Stage it, commit, then run `git branch` to see where HEAD is.',
    ],
    solution: [
      'git switch -c feature/nav',
      'echo "<nav>Home</nav>" > nav.html',
      'git add nav.html',
      'git commit -m "Add navigation"',
    ],
    setup: () => {
      const repo = labRepo({ 'index.html': INDEX_V1 });
      seedCommit(repo, 'Initial commit', { 'index.html': INDEX_V1 });
      return repo;
    },
    check: (repo) => {
      if (repo.head.branch !== 'feature/nav') return false;
      const feature = repo.branches['feature/nav'];
      const main = repo.branches.main;
      if (!feature || !main || feature === main) return false;
      const mainSnap = repo.commits[main].snapshot;
      return 'nav.html' in repo.commits[feature].snapshot && !('nav.html' in mainSnap);
    },
  },
  {
    id: 'b7-merge-ff',
    title: 'Slide forward',
    tagline: 'git merge · fast-forward',
    difficulty: 2,
    story:
      'The navigation works. main never moved while you were away, so Git can simply slide the main pointer up to feature.',
    goal: 'Merge feature/nav into main. It should be a fast-forward, with no merge commit.',
    concepts: ['merge', 'fast-forward', 'ancestor'],
    hints: [
      'Make sure you are on main: `git switch main`.',
      'Then run `git merge feature/nav`. Watch for the words "Fast-forward".',
    ],
    solution: ['git switch main', 'git merge feature/nav'],
    setup: () => {
      const repo = labRepo({ 'index.html': INDEX_V1 });
      seedCommit(repo, 'Initial commit', { 'index.html': INDEX_V1 });
      seedBranch(repo, 'feature/nav');
      seedCommit(repo, 'Add navigation', { 'nav.html': '<nav>Home</nav>\n' });
      switchTo(repo, 'main');
      return repo;
    },
    check: (repo, ctx) => {
      if (!used(ctx, /^git merge/)) return false;
      const feature = repo.branches['feature/nav'];
      return !!feature && repo.branches.main === feature && 'nav.html' in repo.workdir;
    },
  },
  {
    id: 'b8-threeway',
    title: 'Two lines become one',
    tagline: 'git merge · merge commit',
    difficulty: 2,
    story:
      'This time main also moved. Both branches have new work, so Git cannot just slide forward — it must build a merge commit with two parents.',
    goal: 'Merge feature/hero into main. The resulting commit must have two parents and contain both new files.',
    concepts: ['three-way merge', 'merge commit', 'two parents', 'merge base'],
    hints: [
      'You are on main. Run `git merge feature/hero`.',
      'No conflicts are expected: the branches touch different files.',
      'Inspect the result with `git log --oneline --graph`. The merge commit joins both lines.',
    ],
    solution: ['git log --oneline --graph', 'git merge feature/hero'],
    setup: () => {
      const repo = labRepo({ 'index.html': INDEX_V1 });
      seedCommit(repo, 'Initial commit', { 'index.html': INDEX_V1 });
      seedBranch(repo, 'feature/hero');
      switchTo(repo, 'main');
      seedCommit(repo, 'Add footer', { 'footer.txt': '© 2026 My Blog\n' });
      switchTo(repo, 'feature/hero');
      seedCommit(repo, 'Add hero section', { 'hero.html': '<section>Hello</section>\n' });
      switchTo(repo, 'main');
      return repo;
    },
    check: (repo, ctx) => {
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        used(ctx, /^git merge/) &&
        !!head &&
        head.parents.length === 2 &&
        'hero.html' in head.snapshot &&
        'footer.txt' in head.snapshot
      );
    },
  },
  {
    id: 'b9-log',
    title: 'Read the map',
    tagline: 'git log --oneline --graph --all',
    difficulty: 1,
    story:
      'History is not a straight line once branches exist. Learn the one command that draws the whole map, including every branch.',
    goal: 'Run git log with --oneline, --graph, and --all together.',
    concepts: ['history graph', 'log flags', 'decorations'],
    hints: [
      'Combine the flags in one command.',
      '`--oneline` makes one row per commit, `--graph` draws the lanes, `--all` includes every branch.',
    ],
    solution: ['git log --oneline --graph --all'],
    setup: () => {
      const repo = labRepo({ 'index.html': INDEX_V1 });
      seedCommit(repo, 'Initial commit', { 'index.html': INDEX_V1 });
      seedBranch(repo, 'feature/hero');
      switchTo(repo, 'main');
      seedCommit(repo, 'Add footer', { 'footer.txt': '© 2026 My Blog\n' });
      switchTo(repo, 'feature/hero');
      seedCommit(repo, 'Add hero section', { 'hero.html': '<section>Hello</section>\n' });
      switchTo(repo, 'main');
      runCommand(repo, 'git merge feature/hero');
      return repo;
    },
    check: (_repo, ctx) =>
      used(ctx, /^git log\b/) &&
      used(ctx, /--oneline/) &&
      used(ctx, /--graph/) &&
      used(ctx, /--all/),
  },
  {
    id: 'b10-clone',
    title: 'Bring it home',
    tagline: 'git clone <url>',
    difficulty: 1,
    story:
      'The demo shop lives on GitHub. You need a full local copy — history, branches, and a link back to the source.',
    goal: `Clone ${DEMO_URL}. The working folder must be populated and origin must be configured.`,
    concepts: ['clone', 'origin', 'remote-tracking branch'],
    hints: [
      'The command is `git clone <url>`.',
      `Use exactly this URL: ${DEMO_URL}`,
      'After cloning, `ls` and `git remote -v` show what arrived.',
    ],
    solution: [`git clone ${DEMO_URL}`, 'ls', 'git remote -v'],
    setup: () => cloneLab(presetFrom(demoSource()), DEMO_URL),
    check: (repo, ctx) => {
      const remote = repo.remotes.origin;
      return (
        repo.initialized &&
        used(ctx, /^git clone/) &&
        !!remote &&
        !!repo.branches.main &&
        repo.head.branch === 'main' &&
        'README.md' in repo.workdir &&
        remote.tracking.main === repo.branches.main
      );
    },
  },
  {
    id: 'b11-push',
    title: 'Ship it',
    tagline: 'git add · commit · push',
    difficulty: 2,
    story:
      'You cloned the team site and improved the About page. Your commit is local only. Send it to origin so everyone can see it.',
    goal: 'Change about.html, commit it, and push to origin/main.',
    concepts: ['push', 'upstream', 'remote branch'],
    hints: [
      'Open about.html from the Files panel and change its text, or use `echo`.',
      '`git add about.html` then `git commit -m "Update about page"`.',
      'Publish with `git push` (the upstream is already configured by clone).',
    ],
    solution: [
      'echo "<h1>About our team</h1>" > about.html',
      'git add about.html',
      'git commit -m "Update about page"',
      'git push',
    ],
    setup: () => cloneFrom(presetFrom(teamSource()), TEAM_URL, 'team-site'),
    check: (repo, ctx) => {
      const initialSha = ctx.initial.branches.main;
      const initialSnap = initialSha ? ctx.initial.commits[initialSha]?.snapshot ?? {} : {};
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        used(ctx, /^git push/) &&
        !!head &&
        repo.remotes.origin?.server.main === repo.branches.main &&
        repo.branches.main !== ctx.initial.branches.main &&
        head.snapshot['about.html'] !== initialSnap['about.html']
      );
    },
  },
  {
    id: 'b12-pull',
    title: 'Catch up',
    tagline: 'git fetch · git pull',
    difficulty: 2,
    story:
      'While you were reading docs, a teammate added a footer and pushed it. Fetch first to download the news without touching your files, then pull it in.',
    goal: 'Run git fetch, then git pull. main must end up containing footer.txt and matching origin/main.',
    concepts: ['fetch vs pull', 'origin/main', 'fast-forward pull'],
    hints: [
      '`git fetch` downloads objects and updates origin/main, but your main stays put.',
      '`git log --oneline --all` now shows the teammate commit on origin/main.',
      '`git pull` (fetch + merge) brings it into your branch. It should fast-forward.',
    ],
    solution: ['git fetch', 'git log --oneline --all', 'git pull'],
    setup: () => {
      const repo = cloneFrom(presetFrom(teamSource()), TEAM_URL, 'team-site');
      teammatePush(repo, 'main', { 'footer.txt': 'Built with Git Ease\n' }, 'Add site footer');
      return repo;
    },
    check: (repo, ctx) => {
      const fetchIndex = firstIndexOf(ctx, /^git fetch/);
      const pullIndex = firstIndexOf(ctx, /^git pull/);
      const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
      return (
        fetchIndex >= 0 &&
        pullIndex > fetchIndex &&
        !!head &&
        head.snapshot['footer.txt'] === 'Built with Git Ease\n' &&
        repo.branches.main === repo.remotes.origin?.server.main
      );
    },
  },
];
