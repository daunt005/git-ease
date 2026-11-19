import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import type { Repo } from '../engine/types.ts';
import type { Section, Task, TaskResult } from '../game/types.ts';
import { runCommand } from '../engine/exec.ts';
import { statusOf } from '../engine/repo.ts';
import { shortId } from '../engine/util.ts';
import { resolveSolutionCommand } from '../game/scenario.ts';
import {
  applyTextScale,
  defaultWorkspace,
  DOCKS,
  loadWorkspace,
  normalizeTextScale,
  PANEL_HINTS,
  PANEL_IDS,
  PANEL_LABELS,
  saveWorkspace,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SCALE_STEP,
  type DockId,
  type PanelId,
  type WorkspaceLayout,
} from '../workspace.ts';
import { RichText } from './RichText.tsx';
import { Terminal, type TermLine } from './Terminal.tsx';
import { CommitGraph } from './Graph.tsx';
import { Zones } from './Zones.tsx';
import { EditorModal } from './EditorModal.tsx';

interface Props {
  section: Section;
  task: Task;
  index: number;
  hasNext: boolean;
  onExit: () => void;
  onComplete: (result: TaskResult) => void;
  onNext: () => void;
  onCheatsheet: () => void;
}

function introLines(task: Task, index: number): TermLine[] {
  return [
    { kind: 'hint', text: `Mission ${index + 1} · ${task.title}` },
    { kind: 'muted', text: 'Type a command and press Enter. `help` lists everything this lab understands.' },
    { kind: 'muted', text: 'Click any file in the repository panel to edit it without a terminal editor.' },
  ];
}

function Difficulty({ level }: { level: number }) {
  return (
    <span className="difficulty" aria-label={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((step) => (
        <i key={step} className={step <= level ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Lab({
  section,
  task,
  index,
  hasNext,
  onExit,
  onComplete,
  onNext,
  onCheatsheet,
}: Props) {
  const [initial] = useState<Repo>(() => task.setup());
  const [repo, setRepo] = useState<Repo>(() => structuredClone(initial));
  const [lines, setLines] = useState<TermLine[]>(() => introLines(task, index));
  const [input, setInput] = useState('');
  const [coach, setCoach] = useState(
    'Run a command to see a plain-English explanation of what changed.',
  );
  const [history, setHistory] = useState<string[]>([]);
  const [cmdLog, setCmdLog] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [solved, setSolved] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ path: string; initial: string; isNew: boolean } | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const [layout, setLayout] = useState<WorkspaceLayout>(() => loadWorkspace());
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [dropHint, setDropHint] = useState<{ dock: DockId; index: number } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const prompt = `~/project (${!repo.initialized ? 'no repo' : repo.head.branch ?? 'detached'}) $`;
  const status = statusOf(repo);
  const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
  const selectedCommit = selected ? repo.commits[selected] : null;

  useEffect(() => {
    saveWorkspace(layout);
  }, [layout]);

  useEffect(() => {
    applyTextScale(layout.textScale);
  }, [layout.textScale]);

  useEffect(() => {
    if (!layoutOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setLayoutOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setLayoutOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [layoutOpen]);

  const run = () => {
    const raw = input.trim();
    if (!raw) return;

    const nextHistory = [...history, raw];
    setHistory(nextHistory);
    setCmdLog((log) => [...log, raw]);
    setCursor(-1);
    setInput('');

    if (raw === 'clear') {
      setLines([]);
      return;
    }

    const next = structuredClone(repo);
    const result = runCommand(next, raw);
    setRepo(next);
    setLines((previous) => [
      ...previous,
      { kind: 'cmd', text: `${prompt} ${raw}` },
      ...result.lines,
    ]);
    if (result.explain) setCoach(result.explain);

    if (!solved && task.check(next, { history: nextHistory, initial })) {
      setSolved(true);
      setShowCleared(true);
      onComplete({ at: Date.now(), hints: hintsShown, commands: nextHistory.length });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      run();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!cmdLog.length) return;
      const next = cursor === -1 ? cmdLog.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(cmdLog[next]);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (cursor === -1) return;
      const next = cursor + 1;
      if (next >= cmdLog.length) {
        setCursor(-1);
        setInput('');
      } else {
        setCursor(next);
        setInput(cmdLog[next]);
      }
      return;
    }
    if (event.key.toLowerCase() === 'l' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setLines([]);
    }
  };

  const focusInput = () => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.terminal-input')?.focus();
    });
  };

  const restart = () => {
    setRepo(structuredClone(task.setup()));
    setLines(introLines(task, index));
    setHistory([]);
    setCmdLog([]);
    setCursor(-1);
    setHintsShown(0);
    setShowSolution(false);
    setSolved(false);
    setShowCleared(false);
    setSelected(null);
    setConfirmRestart(false);
    setCoach('Fresh sandbox. Same mission — try a different path this time.');
    focusInput();
  };

  const openFile = (path: string) => {
    setEditing({
      path,
      initial: repo.workdir[path] ?? repo.index[path] ?? '',
      isNew: !(path in repo.workdir),
    });
  };

  const saveFile = (path: string, content: string) => {
    const next = structuredClone(repo);
    next.workdir[path] = content;
    setRepo(next);
    setEditing(null);
    const tracked = path in (next.head.commit ? next.commits[next.head.commit]?.snapshot ?? {} : {});
    setCoach(
      tracked
        ? `Saved ${path}. It now differs from HEAD, so git status will show it as modified.`
        : `Saved ${path}. New files are untracked until you stage them with git add.`,
    );
    focusInput();
  };

  const visiblePanels = (dock: DockId) =>
    layout.order[dock].filter((id) => !layout.hidden[id]);

  const hidePanel = (id: PanelId) => {
    setLayout((current) => ({ ...current, hidden: { ...current.hidden, [id]: true } }));
  };

  const togglePanel = (id: PanelId) => {
    setLayout((current) => ({
      ...current,
      hidden: { ...current.hidden, [id]: !current.hidden[id] },
    }));
  };

  const movePanel = (id: PanelId, dock: DockId, visibleIndex: number) => {
    setLayout((current) => {
      const visible = current.order[dock].filter(
        (panel) => !current.hidden[panel] && panel !== id,
      );
      const before = visible[visibleIndex];
      const order = { ...current.order };
      for (const key of DOCKS) {
        order[key] = current.order[key].filter((panel) => panel !== id);
      }
      const list = [...order[dock]];
      const insertAt = before ? list.indexOf(before) : list.length;
      list.splice(insertAt < 0 ? list.length : insertAt, 0, id);
      order[dock] = list;
      return {
        ...current,
        order,
        hidden: { ...current.hidden, [id]: false },
      };
    });
  };

  const resetLayout = () => {
    setLayout((current) => ({
      ...defaultWorkspace(),
      textScale: current.textScale,
    }));
  };

  const startDrag = (id: PanelId) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDragging(id);
  };

  const endDrag = () => {
    setDragging(null);
    setDropHint(null);
  };

  const onFixedDragOver = (dock: DockId) => (event: DragEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropHint({ dock, index: 0 });
  };

  const onSlotDragOver = (dock: DockId, index: number) => (event: DragEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropHint({ dock, index: index + (after ? 1 : 0) });
  };

  const onDockDragOver = (dock: DockId) => (event: DragEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropHint({ dock, index: visiblePanels(dock).length });
  };

  const dropPanel = (dock: DockId, index: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragging) movePanel(dragging, dock, index);
    endDrag();
  };

  const beginColumnResize =
    (side: 'left' | 'right') => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const start = layout.widths[side];
      const other = side === 'left' ? layout.widths.right : layout.widths.left;
      const min = side === 'left' ? 220 : 260;

      const move = (moveEvent: PointerEvent) => {
        const mainWidth = mainRef.current?.getBoundingClientRect().width ?? window.innerWidth;
        const max = Math.max(min, mainWidth - other - 420);
        const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        const next = Math.min(max, Math.max(min, start + delta));
        setLayout((current) => ({
          ...current,
          widths: { ...current.widths, [side]: Math.round(next) },
        }));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    };

  const beginRowResize =
    (id: PanelId, edge: 'top' | 'bottom') => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const slot = event.currentTarget.parentElement as HTMLElement | null;
      if (!slot) return;
      const startHeight = slot.getBoundingClientRect().height;
      const startY = event.clientY;

      const move = (moveEvent: PointerEvent) => {
        // Dragging the top edge upwards grows the panel; dragging the bottom
        // edge downwards does the same, so either border behaves like a window.
        const delta = edge === 'top' ? startY - moveEvent.clientY : moveEvent.clientY - startY;
        const next = Math.min(1200, Math.max(90, startHeight + delta));
        setLayout((current) => ({
          ...current,
          heights: { ...current.heights, [id]: Math.round(next) },
        }));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
    };

  const panelSlot = (
    id: PanelId,
    dock: DockId,
    visibleIndex: number,
    children: ReactNode,
  ) => {
    const height = layout.heights[id];
    const isDropBefore =
      dropHint?.dock === dock && dropHint.index === visibleIndex && !layout.hidden[id];
    const resetHeight = () => {
      setLayout((current) => {
        const heights = { ...current.heights };
        delete heights[id];
        return { ...current, heights };
      });
    };
    return (
      <div
        key={id}
        className={`panel-slot ${height ? 'has-height' : ''} ${
          dragging === id ? 'is-dragging' : ''
        } ${isDropBefore ? 'drop-before' : ''}`}
        data-panel={id}
        style={height ? ({ height: `${height}px` } as CSSProperties) : undefined}
        onDragOver={onSlotDragOver(dock, visibleIndex)}
        onDrop={dropPanel(dock, visibleIndex)}
      >
        <div
          className="panel-resize panel-resize-top"
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize this panel — double-click to reset"
          onPointerDown={beginRowResize(id, 'top')}
          onDoubleClick={resetHeight}
        />
        {children}
        <div
          className="panel-resize panel-resize-bottom"
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize this panel — double-click to reset"
          onPointerDown={beginRowResize(id, 'bottom')}
          onDoubleClick={resetHeight}
        />
      </div>
    );
  };

  const panelHead = (id: PanelId, title: string, meta?: ReactNode) => (
    <header
      className="panel-head"
      draggable
      onDragStart={startDrag(id)}
      onDragEnd={endDrag}
      title={`Drag ${title} to another column`}
    >
      <div className="panel-title">
        <span className="panel-grip" aria-hidden="true">
          ⠿
        </span>
        <h2>{title}</h2>
      </div>
      <div className="panel-actions">
        {meta}
        <button
          type="button"
          className="panel-close"
          aria-label={`Hide ${title} panel`}
          onClick={() => hidePanel(id)}
        >
          ✕
        </button>
      </div>
    </header>
  );

  const renderPanel = (id: PanelId, dock: DockId, visibleIndex: number) => {
    if (id === 'hints') {
      return panelSlot(
        id,
        dock,
        visibleIndex,
        <section className="side-card panel-card">
          {panelHead(
            id,
            'Hints',
            <span className="panel-meta">
              {hintsShown}/{task.hints.length}
            </span>,
          )}
          <div className="panel-body">
            {hintsShown === 0 && (
              <p className="side-note">
                Reveal hints one at a time. Finishing with none earns a clean run.
              </p>
            )}
            <div className="hint-list">
              {task.hints.slice(0, hintsShown).map((hint, hintIndex) => (
                <div key={hintIndex} className="hint-item">
                  <span className="hint-number">{hintIndex + 1}</span>
                  <p>
                    <RichText text={hint} />
                  </p>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn ghost small full"
              onClick={() => setHintsShown((count) => Math.min(count + 1, task.hints.length))}
              disabled={hintsShown >= task.hints.length}
            >
              {hintsShown === 0
                ? 'Reveal first hint'
                : hintsShown >= task.hints.length
                  ? 'No more hints'
                  : 'Reveal next hint'}
            </button>
          </div>
        </section>,
      );
    }

    if (id === 'solution') {
      return panelSlot(
        id,
        dock,
        visibleIndex,
        <section className="side-card panel-card">
          {panelHead(id, 'Solution')}
          <div className="panel-body">
            {!showSolution ? (
              <button type="button" className="link-button" onClick={() => setShowSolution(true)}>
                Show a solution path
              </button>
            ) : (
              <>
                <p className="side-note">
                  Commands, not the only answer. Click one to place it in the terminal.
                </p>
                <div className="solution-list">
                  {task.solution.map((command) => (
                    <button
                      key={command}
                      type="button"
                      className="solution-cmd"
                      onClick={() => {
                        setInput(resolveSolutionCommand(repo, command));
                        focusInput();
                      }}
                    >
                      {command}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>,
      );
    }

    if (id === 'graph') {
      return panelSlot(
        id,
        dock,
        visibleIndex,
        <section className="viz-card graph-card panel-card">
          <header
            className="viz-head panel-head"
            draggable
            onDragStart={startDrag(id)}
            onDragEnd={endDrag}
            title="Drag Commit graph to another column"
          >
            <div className="panel-title">
              <span className="panel-grip" aria-hidden="true">
                ⠿
              </span>
              <div>
                <h2>Commit graph</h2>
                <p>
                  {head
                    ? `${shortId(head.id)} · ${Object.keys(repo.commits).length} objects`
                    : 'waiting for the first commit'}
                </p>
              </div>
            </div>
            <div className="panel-actions">
              <span className="zone-count">
                {status.merging ? 'merging' : status.rebasing ? 'rebasing' : 'graph'}
              </span>
              <button
                type="button"
                className="panel-close"
                aria-label="Hide Commit graph panel"
                onClick={() => hidePanel(id)}
              >
                ✕
              </button>
            </div>
          </header>
          <div className="graph-body">
            <CommitGraph
              repo={repo}
              selected={selected}
              onSelect={setSelected}
              scale={layout.textScale}
            />
            {selectedCommit && (
              <div className="commit-detail">
                <div className="commit-detail-head">
                  <code>{shortId(selectedCommit.id)}</code>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setSelected(null)}
                    aria-label="Close commit details"
                  >
                    ✕
                  </button>
                </div>
                <p className="commit-detail-msg">{selectedCommit.message.split('\n')[0]}</p>
                <div className="commit-detail-meta">
                  <span>{selectedCommit.author}</span>
                  <span>
                    parent{selectedCommit.parents.length === 1 ? '' : 's'}:{' '}
                    {selectedCommit.parents.length
                      ? selectedCommit.parents.map((parent) => shortId(parent)).join(', ')
                      : 'none (root)'}
                  </span>
                  <span>{Object.keys(selectedCommit.snapshot).length} files</span>
                </div>
              </div>
            )}
          </div>
          <div className="graph-legend">
            <span><i className="dot head" /> HEAD</span>
            <span><i className="dot merge" /> merge</span>
            <span><i className="dot tag" /> tag</span>
            <span><i className="dot remote" /> remote</span>
          </div>
        </section>,
      );
    }

    return panelSlot(
      id,
      dock,
      visibleIndex,
      <section className="panel-card zones-panel">
        <header
          className="zones-head panel-head"
          draggable
          onDragStart={startDrag(id)}
          onDragEnd={endDrag}
          title="Drag Repository zones to another column"
        >
          <div className="panel-title">
            <span className="panel-grip" aria-hidden="true">
              ⠿
            </span>
            <div>
              <h2>Repository</h2>
              <p>working directory → staging → HEAD → remote</p>
            </div>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="panel-close"
              aria-label="Hide Repository zones panel"
              onClick={() => hidePanel(id)}
            >
              ✕
            </button>
          </div>
        </header>
        <div className="zones-body">
          <Zones
            repo={repo}
            onEdit={openFile}
            onNewFile={() => setEditing({ path: '', initial: '', isNew: true })}
          />
        </div>
      </section>,
    );
  };

  const scalePercent = Math.round(layout.textScale * 100);
  // Collapse the right column when nothing lives there so the command area gets
  // the space. While dragging, keep it open so it stays a valid drop target.
  const rightCollapsed = visiblePanels('right').length === 0 && !dragging;

  return (
    <div className={`lab-page ${section.accent}`}>
      <header className="lab-top">
        <button type="button" className="btn ghost small" onClick={onExit}>
          ← Map
        </button>
        <div className="lab-title">
          <span className="lab-title-section">{section.name}</span>
          <strong>
            {String(index + 1).padStart(2, '0')} · {task.title}
          </strong>
        </div>
        <div className="lab-top-right">
          <span className="rail-progress">
            <span className="rail-progress-track">
              <span style={{ width: `${((index + 1) / section.tasks.length) * 100}%` }} />
            </span>
            {index + 1}/{section.tasks.length}
          </span>
          {solved && (
            <button type="button" className="solved-pill" onClick={() => setShowCleared(true)}>
              ✓ level cleared
            </button>
          )}

          <div className="layout-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className={`btn ghost small ${layoutOpen ? 'active' : ''}`}
              onClick={() => setLayoutOpen((open) => !open)}
              aria-expanded={layoutOpen}
              aria-haspopup="dialog"
            >
              Layout
            </button>
            {layoutOpen && (
              <div className="layout-menu" role="dialog" aria-label="Workspace settings">
                <div className="layout-menu-head">
                  <strong>Workspace</strong>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close workspace settings"
                    onClick={() => setLayoutOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="layout-group">
                  <span className="layout-label">Text size</span>
                  <div className="text-size-row">
                    <button
                      type="button"
                      className="btn ghost small"
                      aria-label="Decrease text size"
                      disabled={layout.textScale <= TEXT_SCALE_MIN}
                      onClick={() =>
                        setLayout((current) => ({
                          ...current,
                          textScale: normalizeTextScale(current.textScale - TEXT_SCALE_STEP),
                        }))
                      }
                    >
                      A−
                    </button>
                    <span className="text-size-value">{scalePercent}%</span>
                    <button
                      type="button"
                      className="btn ghost small"
                      aria-label="Increase text size"
                      disabled={layout.textScale >= TEXT_SCALE_MAX}
                      onClick={() =>
                        setLayout((current) => ({
                          ...current,
                          textScale: normalizeTextScale(current.textScale + TEXT_SCALE_STEP),
                        }))
                      }
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        setLayout((current) => ({ ...current, textScale: 1.1 }))
                      }
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="layout-group">
                  <span className="layout-label">Visible panels</span>
                  {PANEL_IDS.map((id) => (
                    <label key={id} className="layout-toggle">
                      <input
                        type="checkbox"
                        checked={!layout.hidden[id]}
                        onChange={() => togglePanel(id)}
                      />
                      <span className="switch-track" aria-hidden="true">
                        <span />
                      </span>
                      <span className="layout-toggle-copy">
                        <strong>{PANEL_LABELS[id]}</strong>
                        <small>{PANEL_HINTS[id]}</small>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="layout-menu-foot">
                  <button type="button" className="btn ghost small" onClick={resetLayout}>
                    Reset layout
                  </button>
                  <p>Drag a panel header to move it. Drag any panel border to resize it.</p>
                </div>
              </div>
            )}
          </div>

          <button type="button" className="btn ghost small" onClick={onCheatsheet}>
            Cheat sheet
          </button>
          <button type="button" className="btn ghost small" onClick={() => setConfirmRestart(true)}>
            Restart
          </button>
        </div>
      </header>

      {showCleared && (
        <div className="cleared-bar" role="status" aria-live="polite">
          <div className="cleared-bar-inner">
            <span className="cleared-icon" aria-hidden="true">
              ✓
            </span>
            <div className="cleared-copy">
              <strong>Level cleared</strong>
              <span>
                {task.title} · {history.length} {history.length === 1 ? 'command' : 'commands'} ·{' '}
                {hintsShown === 0
                  ? 'clean run, no hints'
                  : `${hintsShown} hint${hintsShown === 1 ? '' : 's'} used`}
              </span>
            </div>
            <div className="cleared-actions">
              <button
                type="button"
                className="btn primary small"
                onClick={() => {
                  setShowCleared(false);
                  onNext();
                }}
              >
                {hasNext ? 'Next level →' : 'Finish track →'}
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  setShowCleared(false);
                  onExit();
                }}
              >
                Map
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss level cleared message"
                onClick={() => setShowCleared(false)}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <main
        className={`lab-main ${rightCollapsed ? 'right-collapsed' : ''}`}
        ref={mainRef}
        style={
          {
            '--dock-left': `${layout.widths.left}px`,
            '--dock-right': `${layout.widths.right}px`,
          } as CSSProperties
        }
      >
        <div
          className={`dock dock-left ${dropHint?.dock === 'left' ? 'is-drop-target' : ''}`}
          onDragOver={onDockDragOver('left')}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropHint(null);
          }}
          onDrop={dropPanel('left', visiblePanels('left').length)}
        >
          <div
            className="panel-slot panel-static"
            onDragOver={onFixedDragOver('left')}
            onDrop={dropPanel('left', 0)}
          >
            <section className="task-card">
              <div className="task-eyebrow">
                <span>Mission {index + 1}</span>
                <Difficulty level={task.difficulty} />
              </div>
              <h1>{task.title}</h1>
              <p className="task-tagline">{task.tagline}</p>
              <p className="task-story">
                <RichText text={task.story} />
              </p>

              <div className="goal-box">
                <span className="goal-label">Goal</span>
                <p>
                  <RichText text={task.goal} />
                </p>
              </div>

              <div className="chip-row">
                {task.concepts.map((concept) => (
                  <span key={concept} className="chip tiny">{concept}</span>
                ))}
              </div>
            </section>
          </div>

          {visiblePanels('left').map((id, visibleIndex) => renderPanel(id, 'left', visibleIndex))}
        </div>

        <div
          className="splitter-col"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize mission column"
          title="Drag to resize the mission column — double-click to reset"
          onPointerDown={beginColumnResize('left')}
          onDoubleClick={() =>
            setLayout((current) => ({
              ...current,
              widths: { ...current.widths, left: 300 },
            }))
          }
        />

        <div
          className={`dock dock-center ${dropHint?.dock === 'center' ? 'is-drop-target' : ''}`}
          onDragOver={onDockDragOver('center')}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropHint(null);
          }}
          onDrop={dropPanel('center', visiblePanels('center').length)}
        >
          <div
            className="panel-slot panel-terminal-slot"
            onDragOver={onFixedDragOver('center')}
            onDrop={dropPanel('center', 0)}
          >
            <section className="lab-center">
              <Terminal
                lines={lines}
                prompt={prompt}
                value={input}
                onChange={(value) => {
                  setInput(value);
                  setCursor(-1);
                }}
                onKeyDown={onKeyDown}
                onRun={run}
              />
              <div className="coach-bar">
                <span className="coach-icon" aria-hidden="true">✦</span>
                <div>
                  <span className="coach-label">What just happened</span>
                  <p>
                    <RichText text={coach} />
                  </p>
                </div>
              </div>
            </section>
          </div>

          {visiblePanels('center').map((id, visibleIndex) =>
            renderPanel(id, 'center', visibleIndex),
          )}
        </div>

        <div
          className="splitter-col splitter-right"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel column"
          title="Drag to resize this column — double-click to reset"
          onPointerDown={beginColumnResize('right')}
          onDoubleClick={() =>
            setLayout((current) => ({
              ...current,
              widths: { ...current.widths, right: 360 },
            }))
          }
        />

        <div
          className={`dock dock-right ${dropHint?.dock === 'right' ? 'is-drop-target' : ''}`}
          onDragOver={onDockDragOver('right')}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropHint(null);
          }}
          onDrop={dropPanel('right', visiblePanels('right').length)}
        >
          {visiblePanels('right').map((id, visibleIndex) =>
            renderPanel(id, 'right', visibleIndex),
          )}
          {visiblePanels('right').length === 0 && (
            <p className="dock-empty">Drop a panel here, or open Layout to show one.</p>
          )}
        </div>
      </main>

      {editing && (
        <EditorModal
          path={editing.path}
          initial={editing.initial}
          isNew={editing.isNew}
          onSave={saveFile}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmRestart && (
        <div className="modal-backdrop" onMouseDown={() => setConfirmRestart(false)}>
          <div className="modal confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
            <span className="modal-eyebrow">Restart mission</span>
            <h2>Reset the sandbox?</h2>
            <p>The repository goes back to its starting state. Hints and completion are not affected.</p>
            <div className="modal-actions wide">
              <button type="button" className="btn ghost" onClick={() => setConfirmRestart(false)}>
                Keep playing
              </button>
              <button type="button" className="btn primary" onClick={restart}>
                Reset level
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


