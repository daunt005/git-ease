import { useMemo } from 'react';
import type { Repo } from '../engine/types.ts';
import { collectTips, layoutGraph } from '../engine/graph.ts';
import { shortId } from '../engine/util.ts';

const LANE_COLORS = ['#ff7a45', '#6cb6ff', '#4cc38a', '#b392f0', '#e3b341', '#ff6b9d'];

const LANE_W = 34;
const ROW_H = 46;
const PAD_X = 24;
const PAD_Y = 28;

interface RefLabel {
  label: string;
  kind: 'head' | 'branch' | 'remote' | 'tag';
  color: string;
}

function refsFor(repo: Repo, sha: string): RefLabel[] {
  const refs: RefLabel[] = [];
  const isHead = repo.head.commit === sha;
  if (isHead) {
    refs.push({
      label: repo.head.branch ? `HEAD → ${repo.head.branch}` : 'HEAD (detached)',
      kind: 'head',
      color: '#ff7a45',
    });
  }
  for (const name of Object.keys(repo.branches).sort()) {
    if (repo.branches[name] !== sha) continue;
    if (isHead && repo.head.branch === name) continue;
    refs.push({ label: name, kind: 'branch', color: '#6cb6ff' });
  }
  for (const remote of Object.values(repo.remotes)) {
    for (const name of Object.keys(remote.tracking).sort()) {
      if (remote.tracking[name] !== sha) continue;
      refs.push({ label: `${remote.name}/${name}`, kind: 'remote', color: '#b392f0' });
    }
  }
  for (const name of Object.keys(repo.tags).sort()) {
    if (repo.tags[name] !== sha) continue;
    refs.push({ label: `⌂ ${name}`, kind: 'tag', color: '#e3b341' });
  }
  return refs;
}

function pillWidth(label: string, scale: number): number {
  return (label.length * 6.4 + 14) * scale;
}

interface Props {
  repo: Repo;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Scales lanes, spacing and ref pills with the workspace text size. */
  scale?: number;
}

export function CommitGraph({ repo, selected, onSelect, scale = 1 }: Props) {
  const layout = useMemo(() => layoutGraph(repo, collectTips(repo, true)), [repo]);
  const laneW = LANE_W * scale;
  const rowH = ROW_H * scale;
  const padX = PAD_X * scale;
  const padY = PAD_Y * scale;

  if (!layout.nodes.length) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-mark">◌</div>
        <p>No commits yet.</p>
        <span>Run <code>git init</code>, stage a file and commit — the first node appears here.</span>
      </div>
    );
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of layout.nodes) {
    positions.set(node.commit.id, {
      x: padX + node.col * laneW,
      y: padY + node.row * rowH,
    });
  }

  let labelEnd = 0;
  for (const node of layout.nodes) {
    const pos = positions.get(node.commit.id)!;
    const refs = refsFor(repo, node.commit.id);
    const total = refs.reduce((sum, ref) => sum + pillWidth(ref.label, scale) + 6 * scale, 0);
    labelEnd = Math.max(labelEnd, pos.x + 16 * scale + total);
  }

  const width = Math.max(330 * scale, labelEnd + 20 * scale, padX + layout.cols * laneW + 80 * scale);
  const height = padY * 2 + Math.max(0, layout.rows - 1) * rowH;

  return (
    <div className="graph-scroll">
      <svg
        className="commit-graph"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Commit graph"
        onClick={() => onSelect(null)}
      >
        {layout.edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const color = LANE_COLORS[edge.fromCol % LANE_COLORS.length];
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={`M ${from.x} ${from.y} C ${from.x} ${from.y + rowH * 0.45}, ${to.x} ${
                to.y - rowH * 0.45
              }, ${to.x} ${to.y}`}
              fill="none"
              stroke={color}
              strokeWidth={2 * scale}
              strokeLinecap="round"
              opacity={0.55}
            />
          );
        })}

        {layout.nodes.map((node) => {
          const pos = positions.get(node.commit.id)!;
          const color = LANE_COLORS[node.col % LANE_COLORS.length];
          const isHead = repo.head.commit === node.commit.id;
          const isMerge = node.commit.parents.length > 1;
          const isSelected = selected === node.commit.id;
          const refs = refsFor(repo, node.commit.id);
          let labelX = pos.x + 18 * scale;

          return (
            <g
              key={node.commit.id}
              className="graph-node"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(isSelected ? null : node.commit.id);
              }}
            >
              <title>
                {shortId(node.commit.id)} · {node.commit.message.split('\n')[0]}
              </title>
              {isSelected && (
                <circle cx={pos.x} cy={pos.y} r={14 * scale} fill="none" stroke="#ffffff" strokeWidth={1.2} opacity={0.8} />
              )}
              {isHead && (
                <circle cx={pos.x} cy={pos.y} r={11.5 * scale} fill="none" stroke={color} strokeWidth={1.2} opacity={0.45} />
              )}
              <circle cx={pos.x} cy={pos.y} r={6.5 * scale} fill="#0d1117" stroke={color} strokeWidth={2.4 * scale} />
              {isMerge && <circle cx={pos.x} cy={pos.y} r={2.4 * scale} fill={color} />}
              {refs.map((ref) => {
                const w = pillWidth(ref.label, scale);
                const rectX = labelX;
                labelX += w + 6 * scale;
                return (
                  <g key={ref.label}>
                    <rect
                      x={rectX}
                      y={pos.y - 9 * scale}
                      width={w}
                      height={18 * scale}
                      rx={5 * scale}
                      fill={`${ref.color}22`}
                      stroke={`${ref.color}66`}
                    />
                    <text
                      x={rectX + 7 * scale}
                      y={pos.y + 3.5 * scale}
                      fill={ref.color}
                      fontSize={10.5 * scale}
                      fontFamily="var(--mono)"
                    >
                      {ref.label}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
