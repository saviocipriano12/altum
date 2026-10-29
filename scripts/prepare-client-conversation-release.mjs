// Read-only production inspection. This does not create or promote a deployment.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
const cli = 'C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
async function api(endpoint) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, 'api', endpoint, '--raw'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', c => output += c);
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => { if (code) return reject(Error(`API inspection failed: ${code}`)); try { accept(JSON.parse(output)); } catch { reject(Error('Invalid API response')); } });
  });
}
const baseline = await api('/v13/deployments/altumia.com.br');
if (baseline.projectId !== 'prj_7STDUwhGQa5RcgTfx4elzWpabkbo' || baseline.readyState !== 'READY') throw Error('Unexpected production baseline');
const tree = await api(`/v6/deployments/${baseline.id}/files`);
const files = [];
function collect(nodes, prefix = '') {
  for (const node of nodes) {
    const file = prefix ? `${prefix}/${node.name}` : node.name;
    if (file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) throw Error('Unsafe path');
    if (node.type === 'directory') collect(node.children || [], file);
    else if (node.type === 'file' && /^[a-f0-9]{40}$/.test(node.uid)) files.push({ file, sha: node.uid });
    else throw Error('Unexpected source node');
  }
}
collect(tree.find(node => node.name === 'src')?.children || []);
if (files.length < 100) throw Error('Missing production source');
const directory = resolve(`.qa-artifacts/client-conversation-release-${Date.now()}`);
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'baseline.json'), JSON.stringify({ baseline: baseline.id, project: baseline.projectId, files }, null, 2));
const inspect = ['lib/server/ai/router.ts', 'lib/server/ai/agent.ts', 'lib/server/ai/conversation-policy.ts', 'lib/server/ai/conversation-context.ts'];
for (const file of inspect) {
  const entry = files.find(f => f.file === file);
  if (!entry) { console.log(JSON.stringify({ file, exists: false })); continue; }
  const response = await api(`/v8/deployments/${baseline.id}/files/${entry.sha}`);
  const path = join(directory, 'source', file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(response.data, 'base64').toString('utf8').replaceAll('\r\n', '\n'));
  console.log(JSON.stringify({ file, exists: true }));
}
console.log(JSON.stringify({ baseline: baseline.id, directory, totalFiles: files.length }));
