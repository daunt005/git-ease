import type { Section, SectionId, Task } from './types.ts';
import { beginnerTasks } from './beginner.ts';
import { advancedTasks } from './advanced.ts';

export const sections: Section[] = [
  {
    id: 'beginner',
    name: 'Foundations',
    eyebrow: 'Beginner track',
    description:
      'The everyday Git you cannot avoid: init, stage, commit, branch, merge, clone, fetch, pull, push. Twelve guided missions.',
    duration: '12 levels · ~45 min',
    accent: 'orange',
    tasks: beginnerTasks,
  },
  {
    id: 'advanced',
    name: 'Power moves',
    eyebrow: 'Advanced track',
    description:
      'Conflicts, stash, rebase, revert, reset modes, cherry-pick, tags, reflog rescues, and pushing through diverged history.',
    duration: '12 levels · ~75 min',
    accent: 'blue',
    tasks: advancedTasks,
  },
];

export const allTasks: Task[] = sections.flatMap((section) => section.tasks);

export function getSection(id: SectionId): Section {
  return sections.find((section) => section.id === id) ?? sections[0];
}

export function getTask(sectionId: SectionId, taskId: string): { section: Section; task: Task; index: number } {
  const section = getSection(sectionId);
  const index = section.tasks.findIndex((task) => task.id === taskId);
  return { section, task: section.tasks[Math.max(0, index)], index: Math.max(0, index) };
}

export function nextTaskAfter(section: Section, taskId: string): Task | undefined {
  const index = section.tasks.findIndex((task) => task.id === taskId);
  return section.tasks[index + 1];
}
