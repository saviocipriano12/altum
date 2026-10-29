// A four-file release over the exact current production tree; never the shared checkout.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const execute = promisify(execFile);
const cli = 'C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const directory = resolve('.qa-artifacts/client-conversation-release-1792439938355');
const changed = ['lib/server/ai/router.ts', 'lib/server/ai/conversation-policy.ts', 'lib/server/ai/conversation-context.ts', 'lib/server/ai/agent.ts'];
const hash = data => createHash('sha256').update(data).digest('hex');
async function api(endpoint, body) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, 'api', endpoint, '--raw', ...(body ? ['--method', 'POST', '--input', '-'] : [])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', c => output += c); child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => { if (code) return reject(Error(`Vercel API failed (${code})`)); try { accept(JSON.parse(output)); } catch { reject(Error('Invalid API response')); } });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}
const mode = process.argv[2];
if (!['prepare', 'deploy', 'status', 'promote', 'verify'].includes(mode)) throw Error('Use prepare/deploy/status/promote/verify');
const baseline = JSON.parse(await readFile(join(directory, 'baseline.json'), 'utf8'));
if (baseline.project !== 'prj_7STDUwhGQa5RcgTfx4elzWpabkbo') throw Error('Wrong project');
if (mode === 'prepare') {
  if ((await api('/v13/deployments/altumia.com.br')).id !== baseline.baseline) throw Error('Production changed; review new baseline');
  const files = new Map(baseline.files.map(entry => [entry.file, entry]));
  const reviewed = [];
  for (const file of changed) {
    const entry = files.get(file);
    const path = join(directory, 'source', file);
    await mkdir(dirname(path), { recursive: true });
    if (file !== 'lib/server/ai/agent.ts') await writeFile(path, await readFile(file));
    const data = await readFile(path);
    if (file === 'lib/server/ai/agent.ts') {
      if (!entry) throw Error('Missing agent');
      const response = await api(`/v8/deployments/${baseline.baseline}/files/${entry.sha}`);
      const original = Buffer.from(response.data, 'base64').toString('utf8').replaceAll('\r\n', '\n');
      const needle = 'llmRun = await runConversationAgent(\n        {\n          tenantId,\n          chatId,\n';
      if (original.split(needle).length !== 2) throw Error('Unexpected agent call');
      const expected = original.replace(needle, needle + '          inboundMessageId: messageId,\n');
      if (data.toString('utf8').replaceAll('\r\n', '\n') !== expected) throw Error('Agent contains unrelated changes');
    }
    files.set(file, { file, data: data.toString('base64'), encoding: 'base64' });
    reviewed.push({ file, beforeSha: entry?.sha || null, sha256: hash(data) });
  }
  const manifest = { baseline: baseline.baseline, project: baseline.project, reviewed, files: [...files.values()], audioDeferred: true, preparedAt: new Date().toISOString() };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ baseline: manifest.baseline, reviewed, files: files.size }));
} else {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (JSON.stringify(manifest.reviewed.map(f => f.file)) !== JSON.stringify(changed)) throw Error('Scope mismatch');
  for (const item of manifest.reviewed) {
    const entry = manifest.files.find(f => f.file === item.file);
    if (!entry || hash(Buffer.from(entry.data, 'base64')) !== item.sha256) throw Error('Manifest changed');
  }
  if (mode === 'deploy') {
    if ((await api('/v13/deployments/altumia.com.br')).id !== manifest.baseline) throw Error('Production changed');
    const deployment = await api('/v13/deployments', { name: 'altum', project: manifest.project, target: 'production', autoAssignCustomDomains: false,
      files: manifest.files, meta: { actor: 'codex', purpose: 'client-conversation-context-audio-deferred', baselineDeployment: manifest.baseline } });
    const receipt = { id: deployment.id, url: deployment.url, baseline: manifest.baseline, changed, audioDeferred: true };
    await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } else {
    const receipt = JSON.parse(await readFile(join(directory, 'receipt.json'), 'utf8'));
    const deployment = await api(`/v13/deployments/${receipt.id}`);
    if (mode === 'verify') {
      if ((await api('/v13/deployments/altumia.com.br')).id !== receipt.id) throw Error('Domain does not serve this release');
      const tree = await api(`/v6/deployments/${receipt.id}/files`);
      const liveFiles = new Map();
      function collect(nodes, prefix = '') {
        for (const node of nodes) {
          const path = prefix ? `${prefix}/${node.name}` : node.name;
          if (node.type === 'directory') collect(node.children || [], path);
          else if (node.type === 'file') liveFiles.set(path, node.uid);
        }
      }
      collect(tree.find(node => node.name === 'src')?.children || []);
      if (liveFiles.size !== manifest.files.length) throw Error('Unexpected source tree size');
      for (const entry of manifest.files) {
        if (entry.sha && liveFiles.get(entry.file) !== entry.sha) throw Error(`Unrelated source changed: ${entry.file}`);
      }
      for (const item of manifest.reviewed) {
        const uid = liveFiles.get(item.file);
        if (!uid) throw Error(`Missing release file: ${item.file}`);
        const response = await api(`/v8/deployments/${receipt.id}/files/${uid}`);
        const data = Buffer.from(response.data, 'base64');
        if (hash(data) !== item.sha256) throw Error(`Source mismatch: ${item.file}`);
      }
      const checks = [];
      for (const [path, expected] of [['/', 200], ['/cliente/login', 200], ['/cliente/painel/inbox', 200], ['/api/internal/jobs/ai/process?health=1', 401], ['/api/tenant/qa-release-nonexistent/chats', 401]]) {
        const response = await fetch(`https://altumia.com.br${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
        checks.push({ path, expected, actual: response.status });
        await response.body?.cancel();
        if (response.status !== expected) throw Error(`HTTP verification failed: ${path} (${response.status})`);
      }
      await writeFile(join(directory, 'verified.json'), JSON.stringify({ id: receipt.id, verifiedAt: new Date().toISOString(), sourceHashesVerified: true, checks, authenticatedConversationTested: false }, null, 2));
      console.log(JSON.stringify({ verified: true, id: receipt.id, checks }));
    }
    if (mode === 'promote') {
      if (deployment.readyState !== 'READY') throw Error('Build is not READY');
      const current = await api('/v13/deployments/altumia.com.br');
      if (current.id !== receipt.id) {
        if (current.id !== manifest.baseline) throw Error('Production changed; do not overwrite');
        await execute(process.execPath, [cli, 'promote', receipt.id, '--yes', '--timeout', '60s'], { windowsHide: true, timeout: 90000 });
      }
      if ((await api('/v13/deployments/altumia.com.br')).id !== receipt.id) throw Error('Domain did not change');
      await writeFile(join(directory, 'promoted.json'), JSON.stringify({ ...receipt, promotedAt: new Date().toISOString() }, null, 2));
    }
    console.log(JSON.stringify({ id: receipt.id, state: deployment.readyState, error: deployment.errorMessage || null, promoted: mode === 'promote', url: deployment.url }));
  }
}
