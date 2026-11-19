# git-ease

Learn Git by typing real commands and watching a repository react.

Git Ease is a static, browser-only learning site. Each level gives you a concrete task — not a multiple-choice quiz — and checks the resulting repository state. A miniature Git engine runs entirely in the browser, so nothing is installed, uploaded, or stored on a server.

- **Two tracks:** Foundations (beginner essentials) and Power moves (advanced Git).
- **24 guided missions**, each with a story, a goal, progressive hints, and an optional solution.
- **Live visualisation:** commit graph with branches/remotes/tags, plus working directory → staging area → HEAD → remote.
- **Plain-English coaching:** every command returns realistic Git output and a sentence explaining what changed.
- **Browser-persisted progress:** per-track progress bars, sequential unlocking, and an unlock-all switch.
- **Zero backend:** deploy the built `dist/` folder to any static host.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL (defaults to <http://localhost:5173>).

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

## Tests

The engine and every level solution are covered by Node scripts that use native TypeScript type-stripping (Node 22+):

```bash
npm test               # both suites
npm run test:engine    # low-level Git engine flows
npm run test:tasks     # runs each level's solution against its check
```

The task suite verifies that every level starts unsolved, that its documented solution satisfies the check, and that the check tracks repository state.

## What is simulated

The engine is a TypeScript model of Git, not a shell wrapper. It supports:

| Area | Commands |
| --- | --- |
| Setup | `git init`, `git clone`, `git remote add`, `git remote -v` |
| Daily loop | `git status`, `git add`, `git commit`, `git diff`, `git log` |
| Branches | `git branch`, `git switch`, `git checkout`, `git merge`, `git rebase` |
| History | `git reset`, `git revert`, `git cherry-pick`, `git tag`, `git reflog`, `git stash` |
| Remotes | `git fetch`, `git pull`, `git push` |
| Files | `git restore`, `git rm` |

A small shell subset helps you create and inspect files: `ls`, `cat`, `echo "text" > file` (and `>>`), `touch`, `rm`, `pwd`, `clear`, and `help`. You can also click any file in the Files panel to edit it in the browser — this is how merge conflicts are resolved.

Behaviour follows real Git closely enough for learning: branches are movable pointers, `git add` updates the index, merges fast-forward when possible and create two-parent commits otherwise, conflicts write `<<<<<<<` markers, `rebase` replays commits, `push` rejects non-fast-forwards, `pull` fetches then merges, and the reflog survives resets. Commit hashes are deterministic, so every replay starts from the same state.

## Project layout

```
src/
  engine/        Git model, command implementations, diff/graph/format helpers
  game/          Level definitions, scenario builders, checks, progress storage
  components/    Landing, level map, lab, terminal, graph, zones, modals
  App.tsx        View routing and progress persistence
  styles.css     Single design-system stylesheet
scripts/         Node test suites for the engine and level content
```

Progress is stored in `localStorage` under `git-ease.progress.v1`. Clearing site data resets both tracks; there is also a per-track reset button on the level map.

## Deployment

`npm run build` produces a self-contained `dist/` folder. Because `vite.config.ts` uses `base: './'`, the same build works at a root domain or in a subfolder.

- **GitHub Pages:** publish `dist/` to the `gh-pages` branch (or use an action) and enable Pages for that branch.
- **Netlify / Cloudflare Pages / Vercel:** build command `npm run build`, publish directory `dist`.
- **Any file host:** upload the contents of `dist/`.

No environment variables, database, or API keys are required.

## Adding a level

1. Add a task in `src/game/beginner.ts` or `src/game/advanced.ts`:
   - `setup()` returns a fresh `Repo` (use the `labRepo`, `seedCommit`, `seedBranch`, `switchTo`, `cloneFrom`, and `teammatePush` helpers).
   - `goal` and `story` describe the mission in plain language.
   - `check(repo, ctx)` returns true when the state matches the goal. Use `ctx.history` when a specific syntax or command order matters.
   - `solution` lists a valid command sequence.
2. Run `npm run test:tasks` to confirm the level starts unsolved and the solution passes.
3. If the level needs a new Git command, add it to `src/engine/commands/*` and register it in `src/engine/exec.ts`.

## Notes and limitations

- This is a teaching simulator, not a production Git client. It does not touch the real filesystem or network, and it intentionally omits internals such as packfiles, hooks, submodules, and worktrees.
- Merge conflicts are resolved by editing the file and running `git add`; `git mergetool` and `git add -p` are not implemented.
- Remote labs simulate a single `origin`; real multi-remote workflows are out of scope.
- The UI is keyboard-friendly, responsive, and needs no runtime dependencies beyond React.
