import type { ExecResult, Io, Repo } from './types.ts';
import { createIo, finish } from './io.ts';
import { tokenize } from './util.ts';
import {
  cmdAdd,
  cmdCommit,
  cmdDiff,
  cmdInit,
  cmdRestore,
  cmdRm,
  cmdStatus,
} from './commands/basic.ts';
import { cmdBranch, cmdCheckout, cmdMerge, cmdRebase } from './commands/branches.ts';
import {
  cmdCherryPick,
  cmdLog,
  cmdReflog,
  cmdReset,
  cmdRevert,
  cmdStash,
  cmdTag,
} from './commands/history.ts';
import { cmdClone, cmdFetch, cmdPull, cmdPush, cmdRemote } from './commands/remote.ts';

type Handler = (repo: Repo, args: string[], io: Io) => void;

const GIT_COMMANDS: Record<string, Handler> = {
  init: cmdInit,
  status: cmdStatus,
  add: cmdAdd,
  commit: cmdCommit,
  diff: cmdDiff,
  restore: cmdRestore,
  rm: cmdRm,
  branch: cmdBranch,
  checkout: (repo, args, io) => cmdCheckout(repo, args, io, 'checkout'),
  switch: (repo, args, io) => cmdCheckout(repo, args, io, 'switch'),
  merge: cmdMerge,
  rebase: cmdRebase,
  log: cmdLog,
  reset: cmdReset,
  revert: cmdRevert,
  'cherry-pick': cmdCherryPick,
  tag: cmdTag,
  reflog: cmdReflog,
  stash: cmdStash,
  clone: cmdClone,
  remote: cmdRemote,
  fetch: cmdFetch,
  pull: cmdPull,
  push: cmdPush,
};

export const SUPPORTED_COMMANDS = Object.keys(GIT_COMMANDS).sort();

const HELP_TEXT = [
  'Git commands supported by this lab:',
  '',
  '  start        git init · git clone <url>',
  '  inspect      git status · git diff · git log --oneline --graph --all · git reflog',
  '  stage/save   git add <file|.> · git commit -m "msg" · git restore [--staged] <file> · git rm',
  '  branches     git branch · git switch <name> · git switch -c <name> · git checkout <name>',
  '  combine      git merge <branch> · git rebase <branch>',
  '  undo         git reset [--soft|--hard] <ref> · git revert <ref> · git cherry-pick <ref>',
  '  share        git remote -v · git fetch · git pull [--rebase] · git push [-u]',
  '  extras       git stash · git stash pop · git tag <name>',
  '',
  'Shell commands: ls · cat <file> · touch <file> · echo "text" > <file> · rm <file> · pwd · clear',
].join('\n');

function shellHelp(io: Io): void {
  io.out(HELP_TEXT);
}

function shellLs(repo: Repo, io: Io): void {
  const files = Object.keys(repo.workdir).sort();
  if (!files.length) {
    io.muted('(empty folder)');
    return;
  }
  io.out(files.join('\n'));
}

function shellCat(repo: Repo, args: string[], io: Io): void {
  const path = args.find((arg) => !arg.startsWith('-'));
  if (!path) {
    io.err('cat: missing file operand');
    return;
  }
  if (!(path in repo.workdir)) {
    io.err(`cat: ${path}: No such file or directory`);
    return;
  }
  io.out(repo.workdir[path]);
}

function shellTouch(repo: Repo, args: string[], io: Io): void {
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (!paths.length) {
    io.err('touch: missing file operand');
    return;
  }
  for (const path of paths) {
    if (!(path in repo.workdir)) repo.workdir[path] = '';
  }
  io.touch('workdir');
  io.say('Created the file on disk. Git ignores it until you stage it with `git add`.');
}

function shellEcho(repo: Repo, args: string[], io: Io): void {
  const redirect = args.findIndex((arg) => arg === '>' || arg === '>>');
  if (redirect === -1) {
    io.out(args.join(' '));
    return;
  }
  const append = args[redirect] === '>>';
  const content = args.slice(0, redirect).join(' ');
  const path = args[redirect + 1];
  if (!path) {
    io.err('bash: syntax error near unexpected token `newline`');
    return;
  }
  repo.workdir[path] = append ? `${repo.workdir[path] ?? ''}${repo.workdir[path] ? '\n' : ''}${content}` : content;
  io.touch('workdir');
  io.say(
    `Wrote "${content}" to ${path}. The file now differs from the last commit, so \`git status\` will flag it.`,
  );
}

function shellRm(repo: Repo, args: string[], io: Io): void {
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (!paths.length) {
    io.err('rm: missing operand');
    return;
  }
  for (const path of paths) {
    if (path in repo.workdir) delete repo.workdir[path];
    else io.err(`rm: cannot remove '${path}': No such file or directory`);
  }
  io.touch('workdir');
  io.say('The file was removed from disk. If Git was tracking it, status now shows a deletion.');
}

function runShell(repo: Repo, tokens: string[], io: Io): void {
  const [command, ...args] = tokens;
  switch (command) {
    case 'help':
      shellHelp(io);
      return;
    case 'ls':
      shellLs(repo, io);
      return;
    case 'cat':
      shellCat(repo, args, io);
      return;
    case 'touch':
      shellTouch(repo, args, io);
      return;
    case 'echo':
      shellEcho(repo, args, io);
      return;
    case 'rm':
      shellRm(repo, args, io);
      return;
    case 'pwd':
      io.out('/home/you/project');
      return;
    case 'clear':
      io.muted('(terminal cleared)');
      return;
    case 'cd':
      io.say('This lab keeps you inside ~/project, so cd is not needed.');
      return;
    default:
      io.err(`bash: ${command}: command not found`);
      io.muted('This lab understands: ls, cat, echo, touch, rm, pwd, clear, help');
  }
}

export function runCommand(repo: Repo, raw: string): ExecResult {
  const io = createIo();
  const tokens = tokenize(raw.trim());
  if (!tokens.length) return finish(io);

  const [head, ...rest] = tokens;

  if (head === 'git') {
    if (!rest.length) {
      io.out('usage: git <command> [<args>]');
      io.out('Run `git help` to see the commands this lab supports.');
      return finish(io);
    }
    if (rest[0] === '--version') {
      io.out('git version 2.45.1');
      return finish(io);
    }
    if (rest[0] === 'help' || rest[0] === '--help') {
      shellHelp(io);
      return finish(io);
    }
    const handler = GIT_COMMANDS[rest[0]];
    if (!handler) {
      io.err(`git: '${rest[0]}' is not a git command. See 'git --help'.`);
      io.muted(`Supported commands: ${SUPPORTED_COMMANDS.join(', ')}`);
      io.say('That command is not simulated here. Run `git help` to see what is available.');
      return finish(io);
    }
    try {
      handler(repo, rest.slice(1), io);
    } catch (error) {
      io.err(`fatal: internal error: ${(error as Error).message}`);
    }
    return finish(io);
  }

  runShell(repo, tokens, io);
  return finish(io);
}
