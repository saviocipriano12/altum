import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const entries = await readdir(new URL('../tests', import.meta.url), { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mts'))
  .map((entry) => join('tests', entry.name));

if (files.length === 0) {
  console.error('No smoke tests found.');
  process.exit(1);
}

const child = spawn(process.execPath, ['--no-warnings', '--test', '--experimental-strip-types', '--experimental-specifier-resolution=node', ...files], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
