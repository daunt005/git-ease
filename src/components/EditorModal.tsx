import { useState } from 'react';

interface Props {
  path: string;
  initial: string;
  isNew: boolean;
  onSave: (path: string, content: string) => void;
  onClose: () => void;
}

export function EditorModal({ path, initial, isNew, onSave, onClose }: Props) {
  const [name, setName] = useState(path);
  const [content, setContent] = useState(initial);
  const hasMarkers = /^(<{7}|={7}|>{7})/m.test(content);

  const save = () => {
    const target = name.trim();
    if (!target) return;
    onSave(target, content);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal editor-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">{isNew ? 'New file' : 'Editing file'}</span>
            <h2>{isNew ? 'Create a file' : name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close editor">
            ✕
          </button>
        </header>

        {isNew && (
          <label className="field">
            <span>File name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="notes.txt"
              spellCheck={false}
              autoFocus
            />
          </label>
        )}

        <textarea
          className="editor-area"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          autoFocus={!isNew}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              save();
            }
          }}
        />

        {hasMarkers && (
          <p className="editor-warning">
            Conflict markers detected. Keep the lines you want and delete every line starting with
            {' '}<code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code>, or <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code>.
          </p>
        )}

        <footer className="modal-foot">
          <span className="modal-hint">Saved to the lab's virtual disk · ⌘/Ctrl + Enter</span>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={save} disabled={!name.trim()}>
              Save file
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
