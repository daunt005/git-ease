import type { ExecResult, Io, OutputLine, Repo, Zone } from './types.ts';

export function createIo(): Io {
  const io: Io = {
    lines: [] as OutputLine[],
    touched: [] as Zone[],
    error: false,
    out(text = '') {
      io.lines.push({ kind: 'out', text });
    },
    err(text: string) {
      io.error = true;
      io.lines.push({ kind: 'err', text });
    },
    ok(text: string) {
      io.lines.push({ kind: 'ok', text });
    },
    muted(text: string) {
      io.lines.push({ kind: 'muted', text });
    },
    hint(text: string) {
      io.lines.push({ kind: 'hint', text });
    },
    say(text: string) {
      io.explain = text;
    },
    touch(...zones: Zone[]) {
      for (const zone of zones) if (!io.touched.includes(zone)) io.touched.push(zone);
    },
  };
  return io;
}

export function finish(io: Io): ExecResult {
  return {
    lines: io.lines,
    explain: io.explain,
    touched: io.touched,
    error: io.error,
  };
}

export interface Parsed {
  positionals: string[];
  flags: string[];
  values: Record<string, string[]>;
  /** tokens after a literal -- */
  rest: string[];
}

export function parseArgs(args: string[], valueFlags: string[] = []): Parsed {
  const parsed: Parsed = { positionals: [], flags: [], values: {}, rest: [] };
  const takesValue = (flag: string) => valueFlags.includes(flag);

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--') {
      parsed.rest.push(...args.slice(i + 1));
      break;
    }
    if (token.startsWith('--') && token.length > 2) {
      const eq = token.indexOf('=');
      const name = eq >= 0 ? token.slice(0, eq) : token;
      parsed.flags.push(name);
      if (eq >= 0) (parsed.values[name] ??= []).push(token.slice(eq + 1));
      else if (takesValue(name) && i + 1 < args.length) (parsed.values[name] ??= []).push(args[++i]);
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      const chars = token.slice(1).split('');
      for (let c = 0; c < chars.length; c++) {
        const name = `-${chars[c]}`;
        parsed.flags.push(name);
        if (takesValue(name)) {
          const attached = chars.slice(c + 1).join('');
          if (attached) (parsed.values[name] ??= []).push(attached);
          else if (i + 1 < args.length) (parsed.values[name] ??= []).push(args[++i]);
          break;
        }
      }
      continue;
    }
    parsed.positionals.push(token);
  }
  return parsed;
}

export function hasFlag(parsed: Parsed, ...names: string[]): boolean {
  return names.some((name) => parsed.flags.includes(name));
}

export function flagValue(parsed: Parsed, ...names: string[]): string | undefined {
  for (const name of names) {
    const values = parsed.values[name];
    if (values && values.length) return values[values.length - 1];
  }
  return undefined;
}

export function ensureRepo(repo: Repo, io: Io): boolean {
  if (repo.initialized) return true;
  io.err('fatal: not a git repository (or any of the parent directories): .git');
  io.say('This folder is not a Git repository yet. Run `git init` first.');
  return false;
}

export function notFound(ref: string, io: Io): void {
  io.err(`fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`);
  io.muted("Use '--' to separate paths from revisions, like this:");
  io.muted("'git <command> [<revision>...] -- [<file>...]'");
}

export function pluralizeWith(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
