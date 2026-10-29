// Scoped release: retain the current production source tree and overlay only reviewed CRM fixes.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const cli = 'C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const project = 'prj_7STDUwhGQa5RcgTfx4elzWpabkbo';
const directory = resolve('.qa-artifacts/client-pipeline-release-20261019');
const changed = ['app/cliente/painel/crm/page.tsx', 'app/cliente/painel/pipeline/page.tsx', 'lib/crm-pipeline-view.ts'];
const hash = (data) => createHash('sha256').update(data).digest('hex');
async function api(endpoint, body) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, 'api', endpoint, '--raw', ...(body ? ['--method', 'POST', '--input', '-'] : [])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' } });
    let output = '', error = '';
    child.stdout.on('data', c => output += c); child.stderr.on('data', c => error += c);
    child.on('error', reject); child.on('close', code => {
      if (code) return reject(Error(`Vercel request failed (${endpoint.split('?')[0]}): ${error.slice(-200)}`));
      try { accept(JSON.parse(output)); } catch { reject(Error('Invalid API response')); }
    });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}
const mode = process.argv[2];
if (!['prepare', 'deploy', 'status', 'promote'].includes(mode)) throw Error('Use prepare/deploy/status/promote');
await mkdir(directory, { recursive: true });
if (mode === 'prepare') {
  const baseline = await api('/v13/deployments/altumia.com.br');
  if (baseline.projectId !== project || baseline.readyState !== 'READY') throw Error('Unexpected production');
  const tree = await api(`/v6/deployments/${baseline.id}/files`);
  const files = new Map();
  function collect(nodes, prefix = '') {
    for (const node of nodes) {
      const file = prefix ? `${prefix}/${node.name}` : node.name;
      if (file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) throw Error('Unsafe path');
      if (node.type === 'directory') collect(node.children || [], file);
      else if (node.type === 'file' && /^[a-f0-9]{40}$/.test(node.uid)) files.set(file, { file, sha: node.uid });
      else throw Error('Unexpected source node');
    }
  }
  collect(tree.find(node => node.name === 'src')?.children || []);
  if (files.size < 100) throw Error('Missing production source');
  const reviewed = [];
  for (const file of changed) {
    const entry = files.get(file);
    const path = join(directory, 'source', file);
    await mkdir(dirname(path), { recursive: true });
    let original = '';
    if (entry) {
      const response = await api(`/v8/deployments/${baseline.id}/files/${entry.sha}`);
      original = Buffer.from(response.data, 'base64').toString('utf8').replaceAll('\r\n', '\n');
      await writeFile(path, original);
    }
    if (file.endsWith('page.tsx')) {
      if (!entry) throw Error(`Missing production source ${file}`);
      let patch;
      try { patch = (await exec('git', ['diff', '--no-ext-diff', 'HEAD', '--', file], { windowsHide: true })).stdout; }
      catch { throw Error('Cannot derive reviewed delta'); }
      if (!patch.trim()) throw Error(`Missing delta ${file}`);
      const patchPath = join(directory, file.includes('/crm/') ? 'crm.patch' : 'pipeline.patch');
      await writeFile(patchPath, patch);
      const target = relative(process.cwd(), join(directory, 'source')).replaceAll('\\', '/');
      await exec('git', ['apply', '--check', '--ignore-space-change', `--directory=${target}`, patchPath], { windowsHide: true });
      await exec('git', ['apply', '--ignore-space-change', `--directory=${target}`, patchPath], { windowsHide: true });
      if ((await readFile(path, 'utf8')).replaceAll('\r\n', '\n') === original) throw Error(`Patch was not applied: ${file}`);
    } else {
      if (entry && original.trim() !== (await readFile(file, 'utf8')).trim()) throw Error('Helper already exists with different implementation');
      await writeFile(path, await readFile(file));
    }
    const data = await readFile(path);
    files.set(file, { file, data: data.toString('base64'), encoding: 'base64' });
    reviewed.push({ file, beforeSha: entry?.sha || null, sha256: hash(data) });
  }
  const manifest = { baseline: baseline.id, project, reviewed, files: [...files.values()], preparedAt: new Date().toISOString() };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ baseline: baseline.id, reviewed, totalFiles: files.size, directory }, null, 2));
} else {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.project !== project || JSON.stringify(manifest.reviewed.map(f => f.file)) !== JSON.stringify(changed)) throw Error('Unexpected release scope');
  for (const item of manifest.reviewed) {
    const entry = manifest.files.find(f => f.file === item.file);
    if (!entry || hash(Buffer.from(entry.data, 'base64')) !== item.sha256) throw Error('Modified release');
  }
  if (mode === 'deploy') {
    if ((await api('/v13/deployments/altumia.com.br')).id !== manifest.baseline) throw Error('Production changed; prepare again');
    const deployment = await api('/v13/deployments', { name: 'altum', project, target: 'production', autoAssignCustomDomains: false, files: manifest.files, meta: { actor: 'codex', purpose: 'client-pipeline-configured-kanban', baselineDeployment: manifest.baseline } });
    const receipt = { id: deployment.id, url: deployment.url, baseline: manifest.baseline, changed };
    await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    const receipt = JSON.parse(await readFile(join(directory, 'receipt.json'), 'utf8'));
    const deployment = await api(`/v13/deployments/${receipt.id}`);
    if (mode === 'promote') {
      if (deployment.readyState !== 'READY') throw Error('Release is not READY');
      const current = await api('/v13/deployments/altumia.com.br');
      if (current.id !== receipt.id) {
        if (current.id !== manifest.baseline) throw Error('Production changed; do not overwrite another release');
        await exec(process.execPath, [cli, 'promote', receipt.id, '--yes', '--timeout', '60s'], { windowsHide: true, timeout: 90000 });
      }
      if ((await api('/v13/deployments/altumia.com.br')).id !== receipt.id) throw Error('Domain verification failed');
    }
    console.log(JSON.stringify({ id: receipt.id, state: deployment.readyState, url: deployment.url, promoted: mode === 'promote' }, null, 2));
  }
}
