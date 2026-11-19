import type { Repo } from '../engine/types.ts';

export type SectionId = 'beginner' | 'advanced';

export interface CheckContext {
  /** every raw command entered in this attempt, in order */
  history: string[];
  /** a pristine copy of the starting state */
  initial: Repo;
}

export interface Task {
  id: string;
  title: string;
  tagline: string;
  story: string;
  goal: string;
  concepts: string[];
  difficulty: 1 | 2 | 3;
  hints: string[];
  solution: string[];
  setup: () => Repo;
  check: (repo: Repo, ctx: CheckContext) => boolean;
}

export interface Section {
  id: SectionId;
  name: string;
  eyebrow: string;
  description: string;
  duration: string;
  accent: 'orange' | 'blue';
  tasks: Task[];
}

export interface TaskResult {
  at: number;
  hints: number;
  commands: number;
}

export interface ProgressState {
  completed: Record<string, TaskResult>;
  last: Partial<Record<SectionId, string>>;
  unlockAll: boolean;
}
