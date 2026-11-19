import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

export type TermKind = 'cmd' | 'out' | 'err' | 'ok' | 'muted' | 'hint';

export interface TermLine {
  kind: TermKind;
  text: string;
}

interface Props {
  lines: TermLine[];
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRun: () => void;
}

export function Terminal({ lines, prompt, value, onChange, onKeyDown, onRun }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines]);

  return (
    <section className="terminal-card" onClick={() => inputRef.current?.focus()}>
      <header className="terminal-bar">
        <span className="traffic">
          <i /> <i /> <i />
        </span>
        <span className="terminal-title">terminal</span>
        <span className="terminal-branch">{prompt}</span>
      </header>

      <div className="terminal-body" ref={bodyRef}>
        {lines.map((line, index) => (
          <div key={index} className={`term-line ${line.kind}`}>
            {line.text || '\u00A0'}
          </div>
        ))}

        <div className="terminal-input-row">
          <span className="terminal-prompt">{prompt}</span>
          <input
            ref={inputRef}
            type="text"
            className="terminal-input"
            value={value}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Git command"
            placeholder="type a command…"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="run-button" onClick={onRun} title="Run command (Enter)">
            ↵
          </button>
        </div>
        <div className="terminal-foot">
          <span>↑ ↓ command history</span>
          <span>help for the command list</span>
        </div>
      </div>
    </section>
  );
}
