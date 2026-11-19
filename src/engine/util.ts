import type { Repo, Snapshot } from './types.ts';

/** Split a shell-ish command line into tokens, respecting quotes and > redirection. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < input.length) cur += input[++i];
      else cur += ch;
      has = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
      has = true;
    } else if (ch === '\\' && i + 1 < input.length) {
      cur += input[++i];
      has = true;
    } else if (ch === '>') {
      if (has) {
        tokens.push(cur);
        cur = '';
        has = false;
      }
      if (input[i + 1] === '>') {
        tokens.push('>>');
        i++;
      } else {
        tokens.push('>');
      }
    } else if (/\s/.test(ch)) {
      if (has) {
        tokens.push(cur);
        cur = '';
        has = false;
      }
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) tokens.push(cur);
  return tokens;
}

/** Deterministic 40-char hex id from a seed string. */
export function hashId(seed: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return (part(h1) + part(h2) + part(h1 ^ h2) + part(Math.imul(h1, 31) ^ h2) + part(h2 + 7)).slice(0, 40);
}

export const shortId = (id: string | null | undefined): string => (id ? id.slice(0, 7) : '');

export function firstLine(text: string): string {
  return text.split('\n')[0];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`;
}

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string };

/** Line based diff using an LCS table. Fine for the small files in the lab. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] });
  while (j < m) out.push({ type: 'add', text: b[j++] });
  return out;
}

export interface DiffStats {
  files: number;
  insertions: number;
  deletions: number;
}

export function diffStats(a: Snapshot, b: Snapshot): DiffStats {
  let files = 0;
  let insertions = 0;
  let deletions = 0;
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[path] === b[path]) continue;
    files++;
    for (const line of lineDiff(a[path] ?? '', b[path] ?? '')) {
      if (line.type === 'add') insertions++;
      else if (line.type === 'del') deletions++;
    }
  }
  return { files, insertions, deletions };
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Convert a gitignore-ish pattern into a regex. */
function globToRegex(pattern: string): RegExp {
  let p = pattern;
  let anchored = false;
  if (p.startsWith('/')) {
    anchored = true;
    p = p.slice(1);
  }
  let dirOnly = false;
  if (p.endsWith('/')) {
    dirOnly = true;
    p = p.slice(0, -1);
  }
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*') {
      if (p[i + 1] === '*') {
        re += '.*';
        i++;
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '[') {
      const end = p.indexOf(']', i);
      if (end === -1) re += '\\[';
      else {
        re += '[' + p.slice(i + 1, end) + ']';
        i = end;
      }
    } else if ('.+^$(){}|\\'.includes(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  if (!p.includes('/')) {
    re = '(?:^|/)' + re + (dirOnly ? '(?:/|$)' : '$');
  } else {
    re = (anchored ? '^' : '(?:^|/)') + re + (dirOnly ? '(?:/|$)' : '$');
  }
  return new RegExp(re);
}

export function isIgnored(repo: Repo, path: string): boolean {
  const source = repo.workdir['.gitignore'] ?? repo.index['.gitignore'] ?? '';
  let ignored = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    const pattern = negate ? line.slice(1) : line;
    try {
      if (globToRegex(pattern).test(path)) ignored = !negate;
    } catch {
      /* ignore malformed patterns */
    }
  }
  return ignored;
}

export function matchesGlob(pattern: string, path: string): boolean {
  try {
    return globToRegex(pattern).test(path);
  } catch {
    return pattern === path;
  }
}

export function unionPaths(...snaps: Array<Snapshot | undefined>): string[] {
  const set = new Set<string>();
  for (const snap of snaps) if (snap) for (const key of Object.keys(snap)) set.add(key);
  return [...set].sort();
}

export function snapshotsEqual(a: Snapshot, b: Snapshot): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => a[key] === b[key]);
}
