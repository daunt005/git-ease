import { useEffect, useRef, useState } from 'react';
import type { Repo } from '../engine/types.ts';
import { statusOf } from '../engine/repo.ts';
import { isIgnored, shortId } from '../engine/util.ts';

interface Props {
  repo: Repo;
  onEdit: (path: string) => void;
  onNewFile: () => void;
}

const ZONE_LABELS = ['Working directory', 'Staging area', 'HEAD', 'Remote'];

function statusClass(status: string): string {
  switch (status) {
    case 'A':
      return 'add';
    case 'D':
      return 'del';
    case 'M':
      return 'mod';
    default:
      return 'untracked';
  }
}

export function Zones({ repo, onEdit, onNewFile }: Props) {
  const status = statusOf(repo);
  const untracked = new Set(status.untracked);
  const conflicts = new Set(status.conflicts);
  const unstaged = new Map(status.unstaged.map((change) => [change.path, change.status]));

  const workingPaths = new Set(Object.keys(repo.workdir));
  for (const change of status.unstaged) workingPaths.add(change.path);
  const working = [...workingPaths].sort();

  const head = repo.head.commit ? repo.commits[repo.head.commit] : null;
  const headFiles = head ? Object.keys(head.snapshot).sort() : [];
  const remoteEntries = Object.values(repo.remotes).flatMap((remote) =>
    Object.keys(remote.tracking)
      .sort()
      .map((branch) => ({
        remote: remote.name,
        branch,
        sha: remote.tracking[branch],
        url: remote.url,
      })),
  );

  // The four areas are a horizontal gallery. It may overflow in a narrow dock,
  // so track which card is in view and expose arrows + dots to move between them.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  const syncGallery = () => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflowing(el.scrollWidth - el.clientWidth > 4);
    const start = el.getBoundingClientRect().left;
    const cards = [...el.querySelectorAll<HTMLElement>('.zone-card')];
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const distance = Math.abs(card.getBoundingClientRect().left - start);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    setActive(best);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncGallery();
    const row = el.firstElementChild;
    const observer = new ResizeObserver(syncGallery);
    observer.observe(el);
    if (row) observer.observe(row);
    el.addEventListener('scroll', syncGallery, { passive: true });
    window.addEventListener('resize', syncGallery);
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', syncGallery);
      window.removeEventListener('resize', syncGallery);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToZone = (index: number) => {
    const el = scrollRef.current;
    const card = el?.querySelectorAll<HTMLElement>('.zone-card')[index];
    if (!el || !card) return;
    const delta = card.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollTo({ left: el.scrollLeft + delta, behavior: 'smooth' });
  };

  return (
    <div className="zones-gallery">
      {!repo.initialized && (
        <div className="zone-banner">
          <strong>No repository yet.</strong> Run <code>git init</code> to start tracking this folder.
        </div>
      )}

      <div
        className="zones-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Repository zones"
      >
        <div className="zones">
          <section className="zone-card">
            <header className="zone-head">
              <div>
                <h3>Working directory</h3>
                <p>the files on disk</p>
              </div>
              <span className="zone-count">{working.length}</span>
            </header>
            <div className="zone-files">
              {working.length === 0 && <div className="zone-empty">This folder is empty.</div>}
              {working.map((path) => {
                const conflict = conflicts.has(path);
                const letter = conflict
                  ? '!'
                  : untracked.has(path)
                    ? 'U'
                    : unstaged.get(path) ?? '';
                const ignored = !letter && isIgnored(repo, path);
                return (
                  <button
                    key={path}
                    type="button"
                    className={`file-row ${conflict ? 'conflict' : ''} ${
                      ignored ? 'ignored' : ''
                    } ${path in repo.workdir ? '' : 'ghost'}`}
                    onClick={() => onEdit(path)}
                    title={ignored ? 'Ignored by .gitignore (click to edit)' : 'Edit this file'}
                  >
                    <span
                      className={`file-badge ${
                        letter ? statusClass(letter === '!' ? 'U' : letter) : 'clean'
                      }`}
                    >
                      {letter || '·'}
                    </span>
                    <span className="file-path">{path}</span>
                    {ignored && <span className="file-note">ignored</span>}
                    {conflict && <span className="file-note danger">conflict</span>}
                  </button>
                );
              })}
              <button type="button" className="file-add" onClick={onNewFile}>
                + New file
              </button>
            </div>
          </section>

          <div className="zone-arrow">
            <span className="arrow-line" aria-hidden="true">→</span>
            <span className="arrow-label">git add</span>
          </div>

          <section className="zone-card">
            <header className="zone-head">
              <div>
                <h3>Staging area</h3>
                <p>what the next commit will contain</p>
              </div>
              <span className="zone-count">
                {status.staged.length + status.conflicts.length}
              </span>
            </header>
            <div className="zone-files">
              {status.staged.length === 0 && status.conflicts.length === 0 && (
                <div className="zone-empty">
                  Nothing staged — run <code>git add</code>.
                </div>
              )}
              {status.conflicts.map((path) => (
                <button
                  key={`c-${path}`}
                  type="button"
                  className="file-row conflict"
                  onClick={() => onEdit(path)}
                >
                  <span className="file-badge untracked">!</span>
                  <span className="file-path">{path}</span>
                  <span className="file-note danger">unmerged</span>
                </button>
              ))}
              {status.staged.map((change) => (
                <button
                  key={change.path}
                  type="button"
                  className="file-row"
                  onClick={() => onEdit(change.path)}
                >
                  <span className={`file-badge ${statusClass(change.status)}`}>
                    {change.status}
                  </span>
                  <span className="file-path">{change.path}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="zone-arrow">
            <span className="arrow-line" aria-hidden="true">→</span>
            <span className="arrow-label">git commit</span>
          </div>

          <section className="zone-card">
            <header className="zone-head">
              <div>
                <h3>HEAD</h3>
                <p>{head ? `last commit · ${shortId(head.id)}` : 'no commits yet'}</p>
              </div>
              <span className="zone-count">{headFiles.length}</span>
            </header>
            {head && <div className="head-message">{head.message.split('\n')[0]}</div>}
            <div className="zone-files head-files">
              {headFiles.length === 0 && (
                <div className="zone-empty">No snapshot to show.</div>
              )}
              {headFiles.map((path) => (
                <div key={path} className="file-row static">
                  <span className="file-badge clean">·</span>
                  <span className="file-path">{path}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="zone-arrow">
            <span className="arrow-line" aria-hidden="true">→</span>
            <span className="arrow-label">git push</span>
          </div>

          <section className="zone-card">
            <header className="zone-head">
              <div>
                <h3>Remote</h3>
                <p>{remoteEntries.length ? 'tracking branches' : 'not connected'}</p>
              </div>
              <span className="zone-count">{remoteEntries.length}</span>
            </header>
            <div className="zone-files">
              {remoteEntries.length === 0 && (
                <div className="zone-empty">
                  No remote yet. Add one with <code>git remote add origin &lt;url&gt;</code>.
                </div>
              )}
              {remoteEntries.map((entry) => (
                <div key={`${entry.remote}-${entry.branch}`} className="remote-row">
                  <span className="remote-name">
                    {entry.remote}/{entry.branch}
                  </span>
                  <span className="remote-sha">{shortId(entry.sha)}</span>
                </div>
              ))}
              {remoteEntries.length > 0 && status.upstream && (
                <div className="remote-status">
                  {status.ahead === 0 && status.behind === 0 && (
                    <span className="sync ok">in sync</span>
                  )}
                  {status.ahead > 0 && <span className="sync ahead">↑ {status.ahead} ahead</span>}
                  {status.behind > 0 && (
                    <span className="sync behind">↓ {status.behind} behind</span>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {overflowing && (
        <div className="zones-nav">
          <button
            type="button"
            className="zones-step"
            aria-label="Previous repository zone"
            onClick={() => goToZone(active - 1)}
            disabled={active === 0}
          >
            ‹
          </button>
          <div className="zones-dots" role="tablist" aria-label="Repository zones">
            {ZONE_LABELS.map((label, index) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={`Show ${label}`}
                className={`zones-dot ${index === active ? 'on' : ''}`}
                onClick={() => goToZone(index)}
              />
            ))}
          </div>
          <button
            type="button"
            className="zones-step"
            aria-label="Next repository zone"
            onClick={() => goToZone(active + 1)}
            disabled={active === ZONE_LABELS.length - 1}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
