import type { ProgressState, Section, TaskResult } from './types.ts';

const KEY = 'git-ease.progress.v1';

export const emptyProgress = (): ProgressState => ({
  completed: {},
  last: {},
  unlockAll: false,
});

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return {
      completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
      last: parsed.last && typeof parsed.last === 'object' ? parsed.last : {},
      unlockAll: parsed.unlockAll === true,
    };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(state: ProgressState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage can be unavailable (private mode); progress just won't persist */
  }
}

export function isComplete(progress: ProgressState, taskId: string): boolean {
  return !!progress.completed[taskId];
}

export function sectionStats(section: Section, progress: ProgressState) {
  const done = section.tasks.filter((task) => isComplete(progress, task.id)).length;
  const total = section.tasks.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function isUnlocked(section: Section, index: number, progress: ProgressState): boolean {
  if (progress.unlockAll) return true;
  if (index === 0) return true;
  return isComplete(progress, section.tasks[index - 1].id);
}

export function continueTask(section: Section, progress: ProgressState): string {
  const last = progress.last[section.id];
  if (last && !isComplete(progress, last)) return last;
  const firstOpen = section.tasks.find((task) => !isComplete(progress, task.id));
  return firstOpen?.id ?? section.tasks[section.tasks.length - 1].id;
}

export function markComplete(
  progress: ProgressState,
  sectionId: Section['id'],
  taskId: string,
  result: TaskResult,
): ProgressState {
  return {
    ...progress,
    completed: { ...progress.completed, [taskId]: result },
    last: { ...progress.last, [sectionId]: taskId },
  };
}
