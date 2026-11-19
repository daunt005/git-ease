interface Props {
  onClose: () => void;
}

const GROUPS: Array<{ title: string; blurb: string; items: Array<[string, string]> }> = [
  {
    title: 'Start a repository',
    blurb: 'Create history where there was none, or copy one from a server.',
    items: [
      ['git init', 'turn the current folder into a repository'],
      ['git clone <url>', 'copy a remote repo, its history and its origin link'],
      ['git remote add origin <url>', 'connect an existing local repo to a server'],
    ],
  },
  {
    title: 'The daily loop',
    blurb: 'Inspect, stage, save.',
    items: [
      ['git status', 'compare working tree, index, and HEAD'],
      ['git add <file>', 'stage one file — or git add . for everything'],
      ['git commit -m "msg"', 'save the staged snapshot as a new commit'],
      ['git diff', 'see unstaged changes (add --staged for staged ones)'],
      ['git log --oneline --graph --all', 'draw the whole commit map'],
    ],
  },
  {
    title: 'Branches',
    blurb: 'A branch is a movable pointer. Switching moves HEAD.',
    items: [
      ['git branch', 'list branches (* marks the current one)'],
      ['git switch <name>', 'move onto an existing branch'],
      ['git switch -c <name>', 'create a branch and move onto it'],
      ['git merge <branch>', 'join another branch into the current one'],
      ['git rebase <branch>', 'replay your commits on top of another branch'],
    ],
  },
  {
    title: 'Undo safely',
    blurb: 'Move the pointer, restore files, or reverse a commit.',
    items: [
      ['git restore <file>', 'discard unstaged edits (unrecoverable)'],
      ['git restore --staged <file>', 'unstage without touching the file'],
      ['git reset --soft HEAD~1', 'move back one commit, keep changes staged'],
      ['git reset --hard <ref>', 'move back and throw changes away'],
      ['git revert <ref>', 'new commit that reverses an old one'],
      ['git cherry-pick <ref>', 'copy one commit onto the current branch'],
      ['git commit --amend -m "msg"', 'rewrite the last commit'],
    ],
  },
  {
    title: 'Work with remotes',
    blurb: 'origin is the default nickname for the source URL.',
    items: [
      ['git remote -v', 'show remote names and URLs'],
      ['git fetch', 'download new commits into origin/* only'],
      ['git pull', 'fetch + merge into your branch'],
      ['git pull --rebase', 'fetch + replay your commits on top'],
      ['git push -u origin main', 'upload commits and set the upstream'],
      ['git push --tags', 'upload tags too'],
    ],
  },
  {
    title: 'Parking and labels',
    blurb: 'Save work aside, or name an important commit.',
    items: [
      ['git stash', 'park uncommitted changes and reset the tree'],
      ['git stash pop', 'bring the parked changes back'],
      ['git tag -a v1.0.0 -m "release"', 'annotated tag on HEAD'],
      ['git reflog', 'everywhere HEAD has been — your undo diary'],
    ],
  },
  {
    title: 'Shell helpers in this lab',
    blurb: 'The terminal is not Git, but you need files to play with.',
    items: [
      ['ls', 'list files'],
      ['cat <file>', 'print a file'],
      ['echo "text" > <file>', 'write text to a file'],
      ['touch <file>', 'create an empty file'],
      ['rm <file>', 'delete a file from disk'],
      ['clear', 'clear the terminal output'],
    ],
  },
];

export function Cheatsheet({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal cheat-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">Reference</span>
            <h2>Git cheat sheet</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close cheat sheet">
            ✕
          </button>
        </header>

        <div className="cheat-grid">
          {GROUPS.map((group) => (
            <section key={group.title} className="cheat-group">
              <h3>{group.title}</h3>
              <p>{group.blurb}</p>
              <ul>
                {group.items.map(([command, description]) => (
                  <li key={command}>
                    <code>{command}</code>
                    <span>{description}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">Commands are simulated locally — nothing leaves your browser.</span>
          <button type="button" className="btn primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
