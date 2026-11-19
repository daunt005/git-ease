import type { Repo, Snapshot } from './types.ts';
import { statusOf } from './repo.ts';
import { diffStats, formatDate, hashId, lineDiff, shortId, unionPaths } from './util.ts';

export function decorations(repo: Repo, sha: string): string {
  const parts: string[] = [];
  const current = repo.head.commit === sha ? repo.head.branch : null;
  if (repo.head.commit === sha) parts.push(current ? `HEAD -> ${current}` : 'HEAD');

  for (const name of Object.keys(repo.branches).sort()) {
    if (repo.branches[name] === sha && name !== current) parts.push(name);
  }
  for (const remote of Object.values(repo.remotes)) {
    for (const name of Object.keys(remote.tracking).sort()) {
      if (remote.tracking[name] === sha) parts.push(`${remote.name}/${name}`);
    }
  }
  for (const name of Object.keys(repo.tags).sort()) {
    if (repo.tags[name] === sha) parts.push(`tag: ${name}`);
  }
  return parts.length ? ` (${parts.join(', ')})` : '';
}

export function commitBlock(repo: Repo, sha: string): string[] {
  const commit = repo.commits[sha];
  if (!commit) return [];
  return [
    `commit ${commit.id}${decorations(repo, sha)}`,
    `Author: ${commit.author} <${commit.email}>`,
    `Date:   ${formatDate(commit.time)}`,
    '',
    ...commit.message.split('\n').map((line) => `    ${line}`),
  ];
}

function section(title: string, hint: string, rows: string[]): string[] {
  return ['', title, `  (${hint})`, ...rows];
}

export function statusText(repo: Repo): string[] {
  const st = statusOf(repo);
  const lines: string[] = [];

  if (st.detached) {
    lines.push(`HEAD detached at ${shortId(repo.head.commit)}`);
  } else {
    lines.push(`On branch ${st.branch}`);
  }

  if (st.unborn) {
    lines.push('', 'No commits yet');
  } else if (st.merging) {
    lines.push(
      'You have unmerged paths.',
      '  (fix conflicts and run "git commit")',
      '  (use "git merge --abort" to abort the merge)',
    );
  } else if (st.upstream) {
    if (st.ahead > 0 && st.behind > 0) {
      lines.push(
        `Your branch and '${st.upstream}' have diverged,`,
        `and have ${st.ahead} and ${st.behind} different commits each, respectively.`,
        '  (use "git pull" if you want to integrate the remote branch with yours)',
      );
    } else if (st.ahead > 0) {
      lines.push(
        `Your branch is ahead of '${st.upstream}' by ${st.ahead} commit${st.ahead === 1 ? '' : 's'}.`,
        '  (use "git push" to publish your local commits)',
      );
    } else if (st.behind > 0) {
      lines.push(
        `Your branch is behind '${st.upstream}' by ${st.behind} commit${st.behind === 1 ? '' : 's'}, and can be fast-forwarded.`,
        '  (use "git pull" to update your local branch)',
      );
    } else {
      lines.push(`Your branch is up to date with '${st.upstream}'.`);
    }
  }

  if (st.conflicts.length) {
    lines.push(
      ...section(
        'Unmerged paths:',
        'use "git add <file>..." to mark resolution',
        st.conflicts.map((path) => `\tboth modified:   ${path}`),
      ),
    );
  }

  if (st.staged.length) {
    const label = (status: string) =>
      status === 'A' ? 'new file:' : status === 'M' ? 'modified:' : 'deleted:';
    lines.push(
      ...section(
        'Changes to be committed:',
        'use "git restore --staged <file>..." to unstage',
        st.staged.map(({ path, status }) => `\t${label(status).padEnd(12)}${path}`),
      ),
    );
  }

  if (st.unstaged.length) {
    lines.push(
      ...section(
        'Changes not staged for commit:',
        'use "git add <file>..." to update what will be committed',
        [
          '  (use "git restore <file>..." to discard changes in working directory)',
          ...st.unstaged.map(({ path, status }) =>
            `\t${(status === 'M' ? 'modified:' : 'deleted:').padEnd(12)}${path}`,
          ),
        ],
      ),
    );
  }

  if (st.untracked.length) {
    lines.push(
      ...section(
        'Untracked files:',
        'use "git add <file>..." to include in what will be committed',
        st.untracked.map((path) => `\t${path}`),
      ),
    );
  }

  if (st.conflicts.length) {
    lines.push('', 'no changes added to commit (use "git add" and/or "git commit -a")');
  } else if (!st.staged.length) {
    if (!st.unstaged.length && !st.untracked.length) {
      lines.push('', 'nothing to commit, working tree clean');
    } else if (!st.unstaged.length && st.untracked.length) {
      lines.push('', 'nothing added to commit but untracked files present (use "git add" to track)');
    } else {
      lines.push('', 'no changes added to commit (use "git add" and/or "git commit -a")');
    }
  }

  return lines;
}

function contentHash(content: string | undefined): string {
  return content === undefined ? '0000000' : hashId(content).slice(0, 7);
}

export function diffText(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = [];
  for (const path of unionPaths(before, after)) {
    const a = before[path];
    const b = after[path];
    if (a === b) continue;
    lines.push(`diff --git a/${path} b/${path}`);
    if (a === undefined) lines.push('new file mode 100644');
    else if (b === undefined) lines.push('deleted file mode 100644');
    lines.push(`index ${contentHash(a)}..${contentHash(b)} ${a === undefined || b === undefined ? '' : '100644'}`.trimEnd());
    lines.push(a === undefined ? '--- /dev/null' : `--- a/${path}`);
    lines.push(b === undefined ? '+++ /dev/null' : `+++ b/${path}`);

    const hunks = lineDiff(a ?? '', b ?? '');
    const oldCount = hunks.filter((h) => h.type !== 'add').length;
    const newCount = hunks.filter((h) => h.type !== 'del').length;
    lines.push(`@@ -${oldCount ? 1 : 0},${oldCount} +${newCount ? 1 : 0},${newCount} @@`);
    for (const hunk of hunks) {
      lines.push(`${hunk.type === 'add' ? '+' : hunk.type === 'del' ? '-' : ' '}${hunk.text}`);
    }
  }
  return lines;
}

export function statsText(before: Snapshot, after: Snapshot): string | null {
  const stats = diffStats(before, after);
  if (!stats.files) return null;
  const parts = [`${stats.files} file${stats.files === 1 ? '' : 's'} changed`];
  if (stats.insertions) parts.push(`${stats.insertions} insertion${stats.insertions === 1 ? '' : 's'}(+)`);
  if (stats.deletions) parts.push(`${stats.deletions} deletion${stats.deletions === 1 ? '' : 's'}(-)`);
  return parts.join(', ');
}
