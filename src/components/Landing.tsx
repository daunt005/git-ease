import { useMemo } from 'react';
import type { ProgressState, SectionId } from '../game/types.ts';
import { sections } from '../game/index.ts';
import { sectionStats, continueTask } from '../game/progress.ts';
import { runCommand } from '../engine/exec.ts';
import { labRepo, seedBranch, seedCommit, switchTo } from '../game/scenario.ts';
import { CommitGraph } from './Graph.tsx';

interface Props {
  progress: ProgressState;
  onOpenSection: (id: SectionId) => void;
  onContinue: (id: SectionId) => void;
  onCheatsheet: () => void;
}

function buildDemoRepo() {
  const repo = labRepo({ 'index.html': '<h1>My Shop</h1>\n' });
  seedCommit(repo, 'Start the shop', { 'index.html': '<h1>My Shop</h1>\n' });
  seedBranch(repo, 'feature/nav');
  seedCommit(repo, 'Add navigation', { 'nav.html': '<nav>Shop · About</nav>\n' });
  seedCommit(repo, 'Style navigation', { 'nav.css': 'nav { display: flex; }\n' });
  switchTo(repo, 'main');
  seedCommit(repo, 'Update footer', { 'footer.txt': '© 2026 My Shop\n' });
  runCommand(repo, 'git merge feature/nav');
  runCommand(repo, 'git tag -a v1.0.0 -m "First release"');
  repo.remotes.origin = {
    name: 'origin',
    url: 'https://github.com/you/my-shop.git',
    tracking: { main: repo.branches.main },
    server: { main: repo.branches.main },
    tags: {},
  };
  return repo;
}

const STEPS = [
  {
    number: '01',
    title: 'A task, not a tutorial',
    body: 'Every level gives you a concrete outcome. You figure out the commands — the goal is checked against real repository state.',
  },
  {
    number: '02',
    title: 'Type real Git syntax',
    body: 'No drag and drop. Flags, arguments and messages are typed exactly like a terminal, so the syntax sticks.',
  },
  {
    number: '03',
    title: 'Watch the repo react',
    body: 'Commits, branches, HEAD, the index and the remote are drawn live. Every command explains what it changed.',
  },
];

export function Landing({ progress, onOpenSection, onContinue, onCheatsheet }: Props) {
  const demo = useMemo(buildDemoRepo, []);

  return (
    <div className="landing">
      <header className="site-nav">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <circle cx="6" cy="6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="6" cy="18" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="18" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M6 8.6v6.8M6 12h5.5a3 3 0 0 0 3-3V9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          git-ease
        </div>
        <nav className="site-links">
          <a href="#tracks">Tracks</a>
          <a href="#how">How it works</a>
          <button type="button" className="btn ghost small" onClick={onCheatsheet}>
            Cheat sheet
          </button>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow-pill">Learn Git by doing</span>
            <h1>
              Git makes sense
              <br />
              when you can <em>see</em> it.
            </h1>
            <p className="hero-lead">
              Real commands in a safe sandbox. Watch commits, branches, the staging area and the remote
              react to every keystroke — with a plain-English explanation of what just happened.
            </p>
            <div className="hero-actions">
              <a className="btn primary large" href="#tracks">
                Pick a track ↓
              </a>
              <button
                type="button"
                className="btn ghost large"
                onClick={() => onContinue('beginner')}
              >
                Resume foundations
              </button>
            </div>
            <ul className="hero-points">
              <li>24 guided missions</li>
              <li>Hints, not spoilers</li>
              <li>Progress saved on this device</li>
            </ul>
          </div>

          <div className="hero-visual">
            <div className="hero-graph">
              <header>
                <span className="traffic"><i /><i /><i /></span>
                <span>your repository, live</span>
                <span className="hero-graph-branch">main</span>
              </header>
              <CommitGraph repo={demo} selected={null} onSelect={() => {}} />
              <footer>
                <span><i className="dot head" /> HEAD</span>
                <span><i className="dot merge" /> merge commit</span>
                <span><i className="dot tag" /> tag</span>
              </footer>
            </div>
          </div>
        </section>

        <section className="tracks" id="tracks">
          <div className="section-head">
            <span className="modal-eyebrow">Two tracks</span>
            <h2>Start where you are.</h2>
            <p>
              Foundations covers the mandatory daily loop. Power moves is for the days when something
              went wrong — or when history needs rewriting.
            </p>
          </div>

          <div className="track-grid">
            {sections.map((section) => {
              const stats = sectionStats(section, progress);
              const next = continueTask(section, progress);
              const nextTask = section.tasks.find((task) => task.id === next);
              return (
                <article key={section.id} className={`track-card ${section.accent}`}>
                  <div className="track-top">
                    <span className="track-eyebrow">{section.eyebrow}</span>
                    <span className="track-duration">{section.duration}</span>
                  </div>
                  <h3>{section.name}</h3>
                  <p>{section.description}</p>

                  <div className="track-progress">
                    <div className="progress-labels">
                      <span>{stats.done} of {stats.total} complete</span>
                      <strong>{stats.percent}%</strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${stats.percent}%` }} />
                    </div>
                  </div>

                  <div className="track-actions">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => onOpenSection(section.id)}
                    >
                      {stats.done > 0 ? 'Continue track' : 'Start track'} →
                    </button>
                    {stats.done > 0 && stats.done < stats.total && nextTask && (
                      <button type="button" className="link-button" onClick={() => onContinue(section.id)}>
                        Jump to “{nextTask.title}”
                      </button>
                    )}
                  </div>

                  <ul className="track-syllabus">
                    {section.tasks.slice(0, 5).map((task, index) => (
                      <li key={task.id}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        {task.title}
                      </li>
                    ))}
                    <li className="more">+ {section.tasks.length - 5} more levels</li>
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="how" id="how">
          <div className="section-head">
            <span className="modal-eyebrow">How it works</span>
            <h2>Type. Watch. Understand.</h2>
          </div>
          <div className="step-grid">
            {STEPS.map((step) => (
              <article key={step.number} className="step-card">
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <div>
            <h2>Your first commit is one command away.</h2>
            <p>No sign-up needed. Your progress is saved in this browser.</p>
          </div>
          <button type="button" className="btn primary large" onClick={() => onOpenSection('beginner')}>
            Open the beginner track →
          </button>
        </section>
      </main>

      <footer className="site-foot">
        <span>git-ease · a simulator, not a real shell</span>
        <span>Every command runs locally in your browser.</span>
      </footer>
    </div>
  );
}
