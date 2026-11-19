import type { CheckContext } from './types.ts';

export function used(ctx: CheckContext, pattern: RegExp): boolean {
  return ctx.history.some((command) => pattern.test(command.trim()));
}

export function firstIndexOf(ctx: CheckContext, pattern: RegExp): number {
  return ctx.history.findIndex((command) => pattern.test(command.trim()));
}

export function lastIndexOf(ctx: CheckContext, pattern: RegExp): number {
  for (let i = ctx.history.length - 1; i >= 0; i--) {
    if (pattern.test(ctx.history[i].trim())) return i;
  }
  return -1;
}

export function snapshot(repo: import('../engine/types.ts').Repo, ref?: string): Record<string, string> {
  if (ref) {
    const sha =
      repo.branches[ref] ??
      repo.tags[ref] ??
      repo.remotes.origin?.tracking[ref.replace(/^origin\//, '')] ??
      repo.head.commit;
    return sha ? repo.commits[sha]?.snapshot ?? {} : {};
  }
  return repo.head.commit ? repo.commits[repo.head.commit]?.snapshot ?? {} : {};
}
