import assert from 'node:assert/strict';
import { runCommand } from '../src/engine/exec.ts';
import { sections } from '../src/game/index.ts';
import { resolveSolutionCommand } from '../src/game/scenario.ts';

for (const section of sections) {
  for (const task of section.tasks) {
    const initial = task.setup();
    const repo = structuredClone(initial);
    const history: string[] = [];
    assert.equal(task.check(repo, { history, initial }), false, `${task.id}: solved before any command`);

    let solvedAt = -1;
    task.solution.forEach((raw, index) => {
      const command = resolveSolutionCommand(repo, raw);
      // The conflict level expects the file to be edited by hand before staging.
      if (task.id === 'a1-conflict' && command.startsWith('git add') && repo.conflicts.length) {
        repo.workdir['index.html'] = '<h1>Welcome home</h1>\n';
      }
      const result = runCommand(repo, command);
      history.push(command);
      if (result.error && !command.startsWith('git push')) {
        console.log(`${task.id}: command failed -> ${command}\n${result.lines.map((l) => l.text).join('\n')}`);
      }
      const passed = task.check(repo, { history, initial });
      if (passed && solvedAt === -1) solvedAt = index;
    });

    assert.ok(solvedAt >= 0, `${task.id}: solution never satisfied the check`);
    console.log(`ok ${section.id}/${task.id} (solved after command ${solvedAt + 1} of ${task.solution.length})`);
  }
}

console.log('\nAll task solutions satisfy their checks.');
