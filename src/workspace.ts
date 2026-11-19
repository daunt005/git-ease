export type PanelId = 'hints' | 'solution' | 'graph' | 'zones';
export type DockId = 'left' | 'center' | 'right';

export interface WorkspaceLayout {
  hidden: Record<PanelId, boolean>;
  order: Record<DockId, PanelId[]>;
  widths: { left: number; right: number };
  /** Explicit panel heights in px. Missing means "size to content". */
  heights: Partial<Record<PanelId, number>>;
  textScale: number;
}

export const PANEL_LABELS: Record<PanelId, string> = {
  hints: 'Hints',
  solution: 'Solution path',
  graph: 'Commit graph',
  zones: 'Repository zones',
};

export const PANEL_HINTS: Record<PanelId, string> = {
  hints: 'Reveal help one step at a time',
  solution: 'Commands you can click to try',
  graph: 'Branches, merges and commits',
  zones: 'Working directory, index, HEAD, remote',
};

export const PANEL_IDS: PanelId[] = ['hints', 'solution', 'graph', 'zones'];
export const DOCKS: DockId[] = ['left', 'center', 'right'];

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.5;
export const TEXT_SCALE_STEP = 0.05;

// v2: the workspace gained dock/edge resizing and full-width layout, so old
// short graph heights from v1 would leave odd gaps. Start fresh once.
const KEY = 'git-ease.workspace.v2';

export const defaultWorkspace = (): WorkspaceLayout => ({
  hidden: { hints: false, solution: false, graph: false, zones: false },
  order: {
    left: ['hints', 'solution'],
    center: ['zones'],
    right: ['graph'],
  },
  widths: { left: 300, right: 360 },
  heights: {},
  textScale: 1.1,
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeTextScale(value: unknown): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 1.1;
  const stepped = Math.round(number / TEXT_SCALE_STEP) * TEXT_SCALE_STEP;
  return clamp(Number(stepped.toFixed(2)), TEXT_SCALE_MIN, TEXT_SCALE_MAX);
}

export function loadWorkspace(): WorkspaceLayout {
  const fallback = defaultWorkspace();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayout>;
    const order: Record<DockId, PanelId[]> = { left: [], center: [], right: [] };
    const seen = new Set<PanelId>();

    if (parsed.order && typeof parsed.order === 'object') {
      for (const dock of DOCKS) {
        const list = parsed.order[dock];
        if (!Array.isArray(list)) continue;
        for (const id of list) {
          if (PANEL_IDS.includes(id) && !seen.has(id)) {
            seen.add(id);
            order[dock].push(id);
          }
        }
      }
    }

    // Panels missing from stored data (new panels, older layouts) keep their default dock.
    for (const dock of DOCKS) {
      for (const id of fallback.order[dock]) {
        if (!seen.has(id)) {
          seen.add(id);
          order[dock].push(id);
        }
      }
    }

    const hidden = { ...fallback.hidden };
    if (parsed.hidden && typeof parsed.hidden === 'object') {
      for (const id of PANEL_IDS) {
        if (typeof parsed.hidden[id] === 'boolean') hidden[id] = parsed.hidden[id]!;
      }
    }

    const heights: Partial<Record<PanelId, number>> = {};
    if (parsed.heights && typeof parsed.heights === 'object') {
      for (const id of PANEL_IDS) {
        const value = parsed.heights[id];
        if (typeof value === 'number' && Number.isFinite(value)) {
          heights[id] = clamp(Math.round(value), 80, 1200);
        }
      }
    }

    const widths = {
      left: clamp(Number(parsed.widths?.left) || fallback.widths.left, 220, 520),
      right: clamp(Number(parsed.widths?.right) || fallback.widths.right, 260, 560),
    };

    return {
      hidden,
      order,
      widths,
      heights,
      textScale: normalizeTextScale(parsed.textScale),
    };
  } catch {
    return fallback;
  }
}

export function saveWorkspace(layout: WorkspaceLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* private mode — preferences just won't persist */
  }
}

export function applyTextScale(scale: number): void {
  document.documentElement.style.setProperty('--text-scale', String(normalizeTextScale(scale)));
}
