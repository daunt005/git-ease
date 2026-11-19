import assert from 'node:assert/strict';
import { createRepo, statusOf } from '../src/engine/repo.ts';
import { runCommand } from '../src/engine/exec.ts';
import type { ExecResult, Repo } from '../src/engine/types.ts';

function exec(repo: Repo, cmd: string, show = false): ExecResult {
  const result = runCommand(repo, cmd);
  if (show) {
    console.log(`\n$ ${cmd}`);
    console.log(result.lines.map((line) => line.text).join('\n'));
    if (result.explain) console.log(`» ${result.explain}`);
  }
  return result;
}

function text(result: ExecResult): string {
  return result.lines.map((line) => line.text).join('\n');
}

// ---------------------------------------------------------------------------
// Basics: init, status, add, commit, diff, log
// ---------------------------------------------------------------------------
{
  const repo = createRepo();
  repo.workdir['README.md'] = '# My Blog\n';
  repo.workdir['notes.txt'] = 'scratch\n';

  exec(repo, 'git init');
  assert.equal(repo.initialized, true);
  assert.match(text(exec(repo, 'git status')), /Untracked files:/);

  exec(repo, 'git add README.md');
  assert.equal(repo.index['README.md'], '# My Blog\n');
  assert.equal(repo.index['notes.txt'], undefined);

  const first = exec(repo, 'git commit -m "Initial commit"');
  assert.match(text(first), /\[main [0-9a-f]{7}\] Initial commit/);
  assert.equal(Object.keys(repo.commits).length, 1);
  assert.equal(statusOf(repo).untracked.length, 1);

  repo.workdir['README.md'] = '# My Blog\n\nWelcome!\n';
  const diff = exec(repo, 'git diff');
  assert.match(text(diff), /\+Welcome!/);

  exec(repo, 'git add README.md');
  exec(repo, 'git commit -m "Add welcome line"');
  assert.equal(Object.keys(repo.commits).length, 2);
  assert.equal(statusOf(repo).staged.length, 0);
  assert.match(text(exec(repo, 'git log --oneline')), /Add welcome line/);

  // ignore file
  repo.workdir['.gitignore'] = '*.log\n';
  repo.workdir['debug.log'] = 'noise\n';
  exec(repo, 'git add .');
  assert.equal(repo.index['debug.log'], undefined);
  assert.equal(repo.index['.gitignore'], '*.log\n');
  assert.doesNotMatch(text(exec(repo, 'git status')), /debug\.log/);
  exec(repo, 'git commit -m "Add gitignore"');
  console.log('basics ok');
}

// ---------------------------------------------------------------------------
// Branches + fast-forward merge
// ---------------------------------------------------------------------------
{
  const repo = createRepo();
  repo.workdir['site.txt'] = 'home\n';
  exec(repo, 'git init');
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Start site"');

  exec(repo, 'git switch -c feature');
  assert.equal(repo.head.branch, 'feature');
  repo.workdir['nav.txt'] = 'navigation\n';
  exec(repo, 'git add nav.txt');
  exec(repo, 'git commit -m "Add navigation"');

  exec(repo, 'git switch main');
  assert.equal(repo.workdir['nav.txt'], undefined);
  exec(repo, 'git merge feature');
  assert.equal(repo.branches.main, repo.branches.feature);
  assert.equal(repo.workdir['nav.txt'], 'navigation\n');
  assert.match(text(exec(repo, 'git log --oneline --graph --all')), /Add navigation/);
  console.log('branch/ff merge ok');
}

// ---------------------------------------------------------------------------
// Three-way merge + conflict resolution
// ---------------------------------------------------------------------------
{
  const repo = createRepo();
  repo.workdir['app.txt'] = 'line one\nshared\n';
  exec(repo, 'git init');
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Base"');

  exec(repo, 'git switch -c feature');
  repo.workdir['app.txt'] = 'line one\nfeature version\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Feature edit"');

  exec(repo, 'git switch main');
  repo.workdir['other.txt'] = 'main only\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Main edit"');

  const merge = exec(repo, 'git merge feature');
  assert.match(text(merge), /Merge made by/);
  const head = repo.commits[repo.head.commit!];
  assert.equal(head.parents.length, 2);
  assert.equal(repo.workdir['other.txt'], 'main only\n');

  // conflict case
  exec(repo, 'git switch -c clash');
  repo.workdir['app.txt'] = 'line one\nclash version\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Clash edit"');
  exec(repo, 'git switch main');
  repo.workdir['app.txt'] = 'line one\nmain version\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Main edit 2"');

  const conflicted = exec(repo, 'git merge clash');
  assert.match(text(conflicted), /CONFLICT/);
  assert.equal(repo.conflicts.length, 1);
  assert.match(repo.workdir['app.txt'], /<<<<<<< HEAD/);

  // resolving by editing the file, staging, committing
  repo.workdir['app.txt'] = 'line one\nresolved version\n';
  exec(repo, 'git add app.txt');
  assert.equal(repo.conflicts.length, 0);
  exec(repo, 'git commit -m "Resolve conflict"');
  const mergeCommit = repo.commits[repo.head.commit!];
  assert.equal(mergeCommit.parents.length, 2);
  assert.equal(statusOf(repo).unstaged.length, 0);
  console.log('three-way + conflict ok');
}

// ---------------------------------------------------------------------------
// Reset modes, revert, amend, reflog, cherry-pick, rebase, stash
// ---------------------------------------------------------------------------
{
  const repo = createRepo();
  repo.workdir['a.txt'] = 'a\n';
  exec(repo, 'git init');
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "First"');
  repo.workdir['a.txt'] = 'a\nb\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Second"');

  repo.workdir['a.txt'] = 'a\nb\nc\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Third"');

  exec(repo, 'git reset --soft HEAD~1');
  assert.equal(Object.keys(repo.branches).length >= 1, true);
  assert.equal(statusOf(repo).staged.length, 1);
  assert.equal(repo.workdir['a.txt'], 'a\nb\nc\n');

  exec(repo, 'git reset --hard HEAD');
  assert.equal(statusOf(repo).staged.length, 0);
  assert.equal(repo.workdir['a.txt'], 'a\nb\n');

  // revert
  repo.workdir['a.txt'] = 'a\nbroken\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Break it"');
  const beforeRevert = Object.keys(repo.commits).length;
  const revert = exec(repo, 'git revert HEAD');
  assert.match(text(revert), /Revert "Break it"/);
  assert.equal(repo.workdir['a.txt'], 'a\nb\n');
  assert.equal(Object.keys(repo.commits).length, beforeRevert + 1);

  // amend
  const countBefore = Object.keys(repo.commits).length;
  exec(repo, 'git commit --amend -m "Fix the message"');
  assert.equal(Object.keys(repo.commits).length, countBefore + 1);
  assert.equal(repo.commits[repo.head.commit!].message, 'Fix the message');

  // reflog
  assert.match(text(exec(repo, 'git reflog')), /commit \(amend\)/);

  // stash
  repo.workdir['a.txt'] = 'a\nb\nstashed\n';
  const saved = exec(repo, 'git stash');
  assert.match(text(saved), /Saved working directory/);
  assert.equal(repo.workdir['a.txt'], 'a\nb\n');
  assert.equal(repo.stash.length, 1);
  assert.match(text(exec(repo, 'git stash list')), /stash@\{0\}/);
  exec(repo, 'git stash pop');
  assert.equal(repo.stash.length, 0);
  assert.equal(repo.workdir['a.txt'], 'a\nb\nstashed\n');
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Stashed work"');

  // cherry-pick
  exec(repo, 'git switch -c side');
  repo.workdir['fix.txt'] = 'fixed\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Fix bug"');
  const fixSha = repo.head.commit!;
  exec(repo, 'git switch main');
  const pick = exec(repo, `git cherry-pick ${fixSha}`);
  assert.match(text(pick), /Fix bug/);
  assert.equal(repo.workdir['fix.txt'], 'fixed\n');

  // rebase
  exec(repo, 'git switch -c topic');
  repo.workdir['topic.txt'] = 'topic 1\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Topic 1"');
  repo.workdir['topic.txt'] = 'topic 1\ntopic 2\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Topic 2"');
  exec(repo, 'git switch main');
  repo.workdir['main.txt'] = 'main moved\n';
  exec(repo, 'git add .');
  exec(repo, 'git commit -m "Main moved"');
  const mainSha = repo.head.commit!;
  exec(repo, 'git switch topic');
  const rebase = exec(repo, 'git rebase main');
  assert.match(text(rebase), /Successfully rebased/);
  assert.equal(repo.commits[repo.head.commit!].parents[0] !== undefined, true);
  // first replayed commit should now sit on main
  const topicRoot = repo.commits[repo.commits[repo.head.commit!].parents[0]];
  assert.equal(topicRoot.parents[0], mainSha);

  // ff merge into main after rebase
  exec(repo, 'git switch main');
  exec(repo, 'git merge topic');
  assert.equal(repo.branches.main, repo.branches.topic);
  console.log('reset/revert/amend/stash/cherry-pick/rebase ok');
}

// ---------------------------------------------------------------------------
// Remotes: clone, fetch, pull, push, divergence
// ---------------------------------------------------------------------------
{
  const remote = createRepo();
  remote.initialized = true;
  remote.workdir['index.html'] = '<h1>Hello</h1>\n';
  remote.index = { ...remote.workdir };
  exec(remote, 'git add .');
  exec(remote, 'git commit -m "Initial site"');
  const url = 'https://github.com/you/site.git';

  const lab = createRepo();
  lab.presets[url] = {
    branches: { ...remote.branches },
    commits: structuredClone(remote.commits),
  };

  const clone = exec(lab, `git clone ${url}`);
  assert.match(text(clone), /Cloning into 'site'/);
  assert.equal(lab.initialized, true);
  assert.equal(lab.workdir['index.html'], '<h1>Hello</h1>\n');
  assert.equal(lab.remotes.origin.tracking.main, lab.branches.main);

  lab.workdir['index.html'] = '<h1>Hello world</h1>\n';
  exec(lab, 'git add .');
  exec(lab, 'git commit -m "Update heading"');
  const push = exec(lab, 'git push -u origin main');
  assert.match(text(push), /main -> main/);
  assert.equal(lab.remotes.origin.server.main, lab.branches.main);

  // teammate pushes a new commit
  const serverSha = lab.remotes.origin.server.main!;
  const serverCommit = lab.commits[serverSha];
  const teammateFiles = { ...serverCommit.snapshot, 'footer.txt': 'footer\n' };
  let t = 0;
  let teammateId = '';
  for (let i = 0; i < 100; i++) {
    const candidate = (i * 2654435761 + 12345).toString(16).padStart(40, 'a').slice(0, 40);
    if (!(candidate in lab.commits)) {
      teammateId = candidate;
      t = i;
      break;
    }
  }
  assert.ok(teammateId);
  lab.commits[teammateId] = {
    id: teammateId,
    parents: [serverSha],
    message: 'Teammate adds footer',
    author: 'Teammate',
    email: 'mate@example.com',
    time: lab.clock + 60 + t,
    snapshot: teammateFiles,
  };
  lab.remotes.origin.server.main = teammateId;

  const fetchRes = exec(lab, 'git fetch');
  assert.match(text(fetchRes), /origin\/main/);
  assert.equal(lab.remotes.origin.tracking.main, teammateId);
  assert.equal(lab.branches.main === teammateId, false);

  const pull = exec(lab, 'git pull');
  assert.match(text(pull), /Fast-forward/);
  assert.equal(lab.branches.main, teammateId);
  assert.equal(lab.workdir['footer.txt'], 'footer\n');

  // divergence: local commit + remote commit -> rejected push -> pull --rebase -> push
  lab.workdir['local.txt'] = 'local\n';
  exec(lab, 'git add .');
  exec(lab, 'git commit -m "Local work"');

  const remoteHead = lab.commits[lab.remotes.origin.server.main!];
  const remoteSnap = { ...remoteHead.snapshot, 'remote.txt': 'remote\n' };
  let remoteId = '';
  for (let i = 0; i < 100; i++) {
    const candidate = (i * 40503 + 777).toString(16).padStart(40, 'c').slice(0, 40);
    if (!(candidate in lab.commits)) {
      remoteId = candidate;
      break;
    }
  }
  lab.commits[remoteId] = {
    id: remoteId,
    parents: [lab.remotes.origin.server.main!],
    message: 'Remote moves on',
    author: 'Teammate',
    email: 'mate@example.com',
    time: lab.clock + 60,
    snapshot: remoteSnap,
  };
  lab.remotes.origin.server.main = remoteId;

  const rejected = exec(lab, 'git push');
  assert.match(text(rejected), /rejected/);

  exec(lab, 'git pull --rebase');
  const pushed = exec(lab, 'git push');
  assert.match(text(pushed), /main -> main/);
  assert.equal(lab.remotes.origin.server.main, lab.branches.main);
  assert.equal(lab.workdir['remote.txt'], 'remote\n');
  assert.equal(lab.workdir['local.txt'], 'local\n');
  console.log('remote flow ok');
}

console.log('\nAll engine tests passed.');
