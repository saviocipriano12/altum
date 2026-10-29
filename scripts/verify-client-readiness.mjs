// Read-only verification of application data. Artifacts are local QA results only.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
const mode = process.argv[2];
if (!['unit', 'emulator'].includes(mode)) throw Error('Use unit or emulator');
const entries = await readdir('tests');
const files = entries.filter(name => name.endsWith(mode === 'unit' ? '.test.mts' : '.emulator.mts'))
  .filter(name => mode !== 'emulator' || name !== 'firebase-rules.emulator.mts').sort().map(name => `tests/${name}`);
const env = { ...process.env };
for (const key of Object.keys(env)) if (/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|API_KEY|ACCESS_KEY|CLIENT_EMAIL/i.test(key)) delete env[key];
if (mode === 'emulator') Object.assign(env, { FIREBASE_PROJECT_ID: 'demo-altum-qa-lab', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-altum-qa-lab',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199', GOOGLE_APPLICATION_CREDENTIALS: '', FIREBASE_SERVICE_ACCOUNT_KEY: '' });
const critical = ['lib/server/ai/agent.ts', 'lib/server/ai/router.ts', 'lib/server/ai/conversation-policy.ts', 'lib/server/chat-outbound.ts',
  'lib/server/social/service.ts', 'lib/server/outbound-campaigns.ts', 'lib/server/crm/conversation-intelligence.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(critical.map(async name => [name, createHash('sha256').update(await readFile(name)).digest('hex')])));
const initialHashes = await hashes();
const startedAt = new Date().toISOString(), failures = [], summary = {}, diagnostics = [];
let pending = '';
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=2', ...files],
  { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', data => {
  pending += data.toString(); const lines = pending.split(/\r?\n/); pending = lines.pop();
  for (const line of lines) {
    if (/^not ok /.test(line)) { failures.push(line.slice(0, 500)); console.log(line.slice(0, 500)); }
    const result = line.match(/^# (tests|pass|fail|cancelled|skipped|duration_ms) (.+)$/);
    if (result) summary[result[1]] = Number(result[2]);
  }
});
child.stderr.on('data', data => { if (diagnostics.length < 12) diagnostics.push(data.toString().slice(0, 500)); });
const progress = setInterval(() => console.log(JSON.stringify({ mode, running: true, failedTestsSeen: failures.length })), 30000);
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
clearInterval(progress);
const finalHashes = await hashes();
const report = { mode, startedAt, finishedAt: new Date().toISOString(), exitCode: code, fileCount: files.length, files, summary, failures,
  sourceUnchanged: JSON.stringify(initialHashes) === JSON.stringify(finalHashes), sourceHashes: finalHashes, diagnostics };
const directory = path.resolve('.qa-artifacts/client-readiness-20261019'); await mkdir(directory, { recursive: true });
const output = path.join(directory, `${mode}-${Date.now()}.json`); await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, files: undefined, sourceHashes: undefined, diagnostics: undefined, report: output }));
process.exitCode = code || (report.sourceUnchanged ? 0 : 2);
