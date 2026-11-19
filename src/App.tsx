import { useEffect, useState } from 'react';
import { getSection, getTask, nextTaskAfter } from './game/index.ts';
import type { ProgressState, SectionId, TaskResult } from './game/types.ts';
import { continueTask, loadProgress, markComplete, saveProgress } from './game/progress.ts';
import { Landing } from './components/Landing.tsx';
import { LevelMap } from './components/LevelMap.tsx';
import { Lab } from './components/Lab.tsx';
import { Cheatsheet } from './components/Cheatsheet.tsx';

type View =
  | { name: 'home' }
  | { name: 'map'; section: SectionId }
  | { name: 'lab'; section: SectionId; taskId: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [cheatsheet, setCheatsheet] = useState(false);
  const [resetTarget, setResetTarget] = useState<SectionId | null>(null);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view.name, view.name === 'lab' ? view.taskId : '']);

  const openMap = (section: SectionId) => setView({ name: 'map', section });

  const startTask = (section: SectionId, taskId: string) => setView({ name: 'lab', section, taskId });

  const continueSection = (sectionId: SectionId) => {
    const section = getSection(sectionId);
    startTask(sectionId, continueTask(section, progress));
  };

  const completeTask = (sectionId: SectionId, taskId: string, result: TaskResult) => {
    setProgress((current) => markComplete(current, sectionId, taskId, result));
  };

  const resetSection = (sectionId: SectionId) => {
    const section = getSection(sectionId);
    const ids = new Set(section.tasks.map((task) => task.id));
    setProgress((current) => {
      const completed = Object.fromEntries(
        Object.entries(current.completed).filter(([id]) => !ids.has(id)),
      );
      const last = { ...current.last };
      delete last[sectionId];
      return { ...current, completed, last };
    });
    setResetTarget(null);
  };

  return (
    <>
      {view.name === 'home' && (
        <Landing
          progress={progress}
          onOpenSection={openMap}
          onContinue={continueSection}
          onCheatsheet={() => setCheatsheet(true)}
        />
      )}

      {view.name === 'map' && (
        <LevelMap
          section={getSection(view.section)}
          progress={progress}
          onBack={() => setView({ name: 'home' })}
          onStart={(taskId) => startTask(view.section, taskId)}
          onCheatsheet={() => setCheatsheet(true)}
          onToggleUnlock={() =>
            setProgress((current) => ({ ...current, unlockAll: !current.unlockAll }))
          }
          onReset={() => setResetTarget(view.section)}
        />
      )}

      {view.name === 'lab' && (() => {
        const { section, task, index } = getTask(view.section, view.taskId);
        const next = nextTaskAfter(section, task.id);
        return (
          <Lab
            key={`${view.section}:${task.id}`}
            section={section}
            task={task}
            index={index}
            hasNext={!!next}
            onExit={() => setView({ name: 'map', section: view.section })}
            onComplete={(result) => completeTask(view.section, task.id, result)}
            onNext={() => {
              if (next) startTask(view.section, next.id);
              else setView({ name: 'map', section: view.section });
            }}
            onCheatsheet={() => setCheatsheet(true)}
          />
        );
      })()}

      {cheatsheet && <Cheatsheet onClose={() => setCheatsheet(false)} />}

      {resetTarget && (
        <div className="modal-backdrop" onMouseDown={() => setResetTarget(null)}>
          <div className="modal confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
            <span className="modal-eyebrow">Reset progress</span>
            <h2>Clear this track?</h2>
            <p>
              Completed levels in <strong>{getSection(resetTarget).name}</strong> will be marked as
              unfinished. Other tracks and the sandbox are unaffected.
            </p>
            <div className="modal-actions wide">
              <button type="button" className="btn ghost" onClick={() => setResetTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={() => resetSection(resetTarget)}>
                Reset track
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {view.name === 'lab' ? `Lab open for ${getTask(view.section, view.taskId).task.title}` : ''}
      </div>
    </>
  );
}
