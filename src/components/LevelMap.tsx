import type { ProgressState, Section } from '../game/types.ts';
import { isComplete, isUnlocked, sectionStats } from '../game/progress.ts';

interface Props {
  section: Section;
  progress: ProgressState;
  onBack: () => void;
  onStart: (taskId: string) => void;
  onCheatsheet: () => void;
  onToggleUnlock: () => void;
  onReset: () => void;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LevelMap({ section, progress, onBack, onStart, onCheatsheet, onToggleUnlock, onReset }: Props) {
  const stats = sectionStats(section, progress);
  const firstOpen = section.tasks.find((task) => !isComplete(progress, task.id));
  const continueId = firstOpen?.id ?? section.tasks[section.tasks.length - 1].id;
  const nextIndex = firstOpen ? section.tasks.indexOf(firstOpen) : -1;

  return (
    <div className={`map-page ${section.accent}`}>
      <header className="sub-nav">
        <button type="button" className="btn ghost small" onClick={onBack}>
          ← Home
        </button>
        <div className="sub-nav-title">
          <span>{section.eyebrow}</span>
          <strong>{section.name}</strong>
        </div>
        <button type="button" className="btn ghost small" onClick={onCheatsheet}>
          Cheat sheet
        </button>
      </header>

      <main className="map-main">
        <section className="map-hero">
          <div>
            <span className="modal-eyebrow">{section.id === 'beginner' ? 'Start here' : 'Level up'}</span>
            <h1>{section.name}</h1>
            <p>{section.description}</p>
          </div>

          <div className="map-progress-card">
            <div className="map-percent">{stats.percent}<span>%</span></div>
            <div className="map-progress-body">
              <div className="progress-labels">
                <span>{stats.done} of {stats.total} levels complete</span>
                <strong>{stats.total - stats.done} left</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${stats.percent}%` }} />
              </div>
              <button type="button" className="btn primary small" onClick={() => onStart(continueId)}>
                {stats.done === 0 ? 'Start level 1' : stats.done === stats.total ? 'Replay last level' : `Continue level ${nextIndex + 1}`}
              </button>
            </div>
          </div>
        </section>

        <div className="map-toolbar">
          <span>{section.tasks.length} missions · progress saved in this browser</span>
          <label className="switch">
            <input type="checkbox" checked={progress.unlockAll} onChange={onToggleUnlock} />
            <span className="switch-track"><span /></span>
            Unlock all levels
          </label>
        </div>

        <ol className="level-list">
          {section.tasks.map((task, index) => {
            const done = isComplete(progress, task.id);
            const unlocked = isUnlocked(section, index, progress);
            const isNext = index === nextIndex;
            const result = progress.completed[task.id];
            return (
              <li
                key={task.id}
                className={`level-row ${done ? 'done' : ''} ${unlocked ? '' : 'locked'} ${isNext ? 'next' : ''}`}
              >
                <button
                  type="button"
                  className="level-button"
                  disabled={!unlocked}
                  onClick={() => onStart(task.id)}
                >
                  <span className="level-index">
                    {done ? <CheckIcon /> : unlocked ? String(index + 1).padStart(2, '0') : <LockIcon />}
                  </span>

                  <span className="level-content">
                    <span className="level-heading">
                      <span className="level-title">{task.title}</span>
                      <span className="difficulty" aria-label={`Difficulty ${task.difficulty} of 3`}>
                        {[1, 2, 3].map((step) => (
                          <i key={step} className={step <= task.difficulty ? 'on' : ''} />
                        ))}
                      </span>
                      {isNext && <span className="next-pill">Up next</span>}
                    </span>
                    <span className="level-tagline">{task.tagline}</span>
                    <span className="level-tags">
                      {task.concepts.slice(0, 3).map((concept) => (
                        <span key={concept} className="chip tiny">{concept}</span>
                      ))}
                    </span>
                  </span>

                  <span className="level-side">
                    {done ? (
                      <>
                        <span className="level-done-label">Completed</span>
                        {result && <span className="level-meta">{result.commands} cmds · {result.hints} hints</span>}
                      </>
                    ) : (
                      <span className="level-cta">{unlocked ? 'Start →' : 'Locked'}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="map-foot">
          <p>
            Levels unlock in order. You can replay a finished level any time — the sandbox resets, your
            progress stays.
          </p>
          <button type="button" className="link-button danger" onClick={onReset}>
            Reset this track’s progress
          </button>
        </div>
      </main>
    </div>
  );
}
