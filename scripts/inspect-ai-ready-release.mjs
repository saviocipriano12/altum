// Read-only hosting inspection; freezes source evidence, never deploys.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const cli = 'C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const project = 'prj_7STDUwhGQa5RcgTfx4elzWpabkbo';
const directory = resolve('.qa-artifacts/ai-ready-release-20261021-v2');
const candidates = [
  'lib/server/crm/qualification.ts', 'lib/server/crm/pipeline.ts',
  'lib/server/crm/manual-update.ts', 'lib/server/crm/draft-mutation.ts',
  'lib/server/crm/proposal-mutation.ts', 'lib/server/crm/proposal-crm-proof.ts',
  'lib/server/crm/order-stage-transition.ts', 'lib/server/crm/stage-effects.ts',
  'lib/server/crm/stage-transition.ts', 'lib/server/automations.ts',
  'lib/server/automation-stage-delivery.ts', 'lib/server/automation-proposal-delivery.ts',
  'lib/server/automation-inbound-execution.ts', 'lib/server/automation-message-delivery.ts',
  'lib/server/automation-internal-effect.ts', 'lib/server/tenant-usage.ts',
  'lib/server/ecommerce.ts', 'lib/server/ecommerce-action-delivery.ts',
  'lib/server/commerce/shopify-occurrence-recovery.ts', 'lib/server/commerce/shopify-occurrence.ts',
  'lib/server/commerce/shopify-action-authority.ts', 'lib/server/lead-intake.ts',
  'lib/server/chat-state-identity.ts',
  'lib/server/ai/agent.ts', 'lib/server/ai/router.ts', 'lib/server/ai/conversation-context.ts',
  'lib/server/ai/text-delivery.ts', 'lib/server/ai/handoff-delivery.ts',
];
const sha256 = value => createHash('sha256').update(value).digest('hex');
async function api(endpoint) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, 'api', endpoint, '--raw'], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' },
    });
    let output = ''; const timeout = setTimeout(() => { child.kill(); reject(Error('Hosting inspection timed out')); }, 45000);
    child.stdout.on('data', c => output += c); child.stderr.resume();
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code) return reject(Error(`Hosting inspection failed: ${code}`));
      try { accept(JSON.parse(output)); } catch { reject(Error('Invalid hosting response')); }
    });
  });
}
await mkdir(directory, { recursive: true });
const deployment = await api('/v13/deployments/altumia.com.br');
if (deployment.projectId !== project || deployment.readyState !== 'READY') throw Error('Unexpected production baseline');
const tree = await api(`/v6/deployments/${deployment.id}/files`);
const files = [];
function collect(nodes, prefix = '') {
  for (const node of nodes) {
    const file = prefix ? `${prefix}/${node.name}` : node.name;
    if (file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) throw Error('Unsafe source path');
    if (node.type === 'directory') collect(node.children || [], file);
    else if (node.type === 'file' && /^[a-f0-9]{40}$/.test(node.uid)) files.push({ file, sha: node.uid });
    else throw Error('Unexpected source node');
  }
}
collect(tree.find(node => node.name === 'src')?.children || []);
if (files.length < 100) throw Error('Missing production source tree');
await writeFile(join(directory, 'baseline.json'), JSON.stringify({ baseline: deployment.id, project, files, inspectedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
let cursor = 0; const comparisons = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < candidates.length) {
    const file = candidates[cursor++];
    const entry = files.find(row => row.file === file);
    const local = await readFile(resolve(file));
    let published = null;
    if (entry) {
      const response = await api(`/v8/deployments/${deployment.id}/files/${entry.sha}`);
      if (typeof response.data !== 'string') throw Error(`Missing source data: ${file}`);
      published = Buffer.from(response.data, 'base64');
      const before = join(directory, 'before', file);
      await mkdir(dirname(before), { recursive: true }); await writeFile(before, published, { flag: 'wx' });
    }
    const snapshot = join(directory, 'local', file);
    await mkdir(dirname(snapshot), { recursive: true }); await writeFile(snapshot, local, { flag: 'wx' });
    comparisons.push({ file, exists: !!entry, same: published !== null && published.toString('utf8').replaceAll('\r\n', '\n') === local.toString('utf8').replaceAll('\r\n', '\n'), publishedHash: published && sha256(published), localHash: sha256(local) });
  }
}));
if ((await api('/v13/deployments/altumia.com.br')).id !== deployment.id) throw Error('Production changed during inspection');
comparisons.sort((a, b) => a.file.localeCompare(b.file));
await writeFile(join(directory, 'comparison.json'), JSON.stringify(comparisons, null, 2));
console.log(JSON.stringify({ baseline: deployment.id, totalFiles: files.length, comparisons: comparisons.map(({ file, exists, same }) => ({ file, exists, same })) }, null, 2));
