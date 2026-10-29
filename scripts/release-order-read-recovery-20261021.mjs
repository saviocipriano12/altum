// Single-file, immutable-baseline release. Never deploy the shared checkout.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const execute = promisify(execFile);
const cli = 'C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const root = resolve('.qa-artifacts/ai-ready-release-20261021-v2');
const build = join(root, 'build');
const changed = 'lib/server/crm/order-stage-transition.ts';
const hash = (data, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const mode = process.argv[2];
if (!['prepare', 'baseline', 'validate', 'deploy', 'status', 'promote', 'verify'].includes(mode)) throw Error('Unsupported mode');
async function api(endpoint, body) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, 'api', endpoint, '--raw', ...(body ? ['--method', 'POST', '--input', '-'] : [])],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' } });
    let output = ''; const timeout = setTimeout(() => { child.kill(); reject(Error('Hosting request timed out')); }, 60000);
    child.stdout.on('data', c => output += c); child.stderr.resume();
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout); if (code) return reject(Error(`Hosting request failed (${code})`));
      try { accept(JSON.parse(output)); } catch { reject(Error('Invalid hosting response')); }
    });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}
const baseline = JSON.parse(await readFile(join(root, 'baseline.json'), 'utf8'));
if (baseline.project !== 'prj_7STDUwhGQa5RcgTfx4elzWpabkbo') throw Error('Wrong project');
async function unchangedProduction() {
  if ((await api('/v13/deployments/altumia.com.br')).id !== baseline.baseline) throw Error('Production changed; do not overwrite');
}
if (mode === 'prepare') {
  await unchangedProduction();
  const cacheRoots = [resolve('.qa-artifacts/inbox-production-20261020/source'),
    resolve('.qa-artifacts/inbox-channel-appearance-release-20261020/source'),
    resolve('.qa-artifacts/instagram-profile-release-20261020/source'),
    resolve('.qa-artifacts/instagram-story-release-20261020/source'),
    resolve('.qa-artifacts/meta-inbox-release-20261020/source'), join(root, 'before')];
  let cursor = 0, fetched = 0, reused = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < baseline.files.length) {
      const entry = baseline.files[cursor++];
      if (entry.file.startsWith('/') || entry.file.includes('\\') || entry.file.split('/').includes('..')) throw Error('Unsafe source path');
      let data;
      for (const cache of cacheRoots) {
        try { const value = await readFile(join(cache, entry.file)); if (hash(value, 'sha1') === entry.sha) { data = value; reused++; break; } }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (!data) {
        const response = await api(`/v8/deployments/${baseline.baseline}/files/${entry.sha}`);
        data = Buffer.from(response.data, 'base64');
        if (hash(data, 'sha1') !== entry.sha) throw Error('Source hash mismatch');
        fetched++;
      }
      const path = join(build, entry.file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, data, { flag: 'wx' });
    }
  }));
  // Tests use the production dependencies, not a graph from the shared checkout.
  const publishedPackage = JSON.parse(await readFile(join(build, 'package.json'), 'utf8'));
  const localPackage = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  if (JSON.stringify(publishedPackage.dependencies) !== JSON.stringify(localPackage.dependencies) ||
      JSON.stringify(publishedPackage.devDependencies) !== JSON.stringify(localPackage.devDependencies)) throw Error('Dependency tree differs; install isolated dependencies first');
  await symlink(resolve('node_modules'), join(build, 'node_modules'), 'junction');
  const row = baseline.files.find(entry => entry.file === changed);
  const candidate = await readFile(join(root, 'local', changed));
  const comparison = JSON.parse(await readFile(join(root, 'comparison.json'), 'utf8')).find(entry => entry.file === changed);
  if (!row || comparison.same || hash(candidate) !== comparison.localHash) throw Error('Candidate does not match inspected snapshot');
  await writeFile(join(build, changed), candidate);
  const tests = ['tests/crm-stage-transition.emulator.mts', 'tests/fixtures/stage-schedule-worker.mts',
    'tests/fixtures/stage-internal-worker.mts', 'tests/crm-qualification-pipeline.test.mts',
    'tests/crm-proposal-update.emulator.mts', 'tests/ecommerce-journey.test.mts'];
  for (const file of tests) { const path = join(build, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, await readFile(resolve(file))); }
  const manifest = { baseline: baseline.baseline, project: baseline.project,
    reviewed: [{ file: changed, beforeSha: row.sha, sha256: hash(candidate) }],
    files: baseline.files.map(entry => entry.file === changed ? { file: changed, data: candidate.toString('base64'), encoding: 'base64' } : entry),
    preparedAt: new Date().toISOString(), reused, fetched };
  await unchangedProduction();
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ prepared: true, baseline: manifest.baseline, changed, sha256: hash(candidate), reused, fetched }));
} else if (mode === 'baseline') {
  const destination = join(root, 'baseline-build');
  for (const entry of baseline.files) {
    let data = await readFile(entry.file === changed ? join(root, 'before', changed) : join(build, entry.file));
    if (hash(data, 'sha1') !== entry.sha) {
      // QA test overlays are not production source; retrieve the genuine file.
      const response = await api(`/v8/deployments/${baseline.baseline}/files/${entry.sha}`);
      data = Buffer.from(response.data, 'base64');
      if (hash(data, 'sha1') !== entry.sha) throw Error('Baseline graph does not match production');
    }
    const path = join(destination, entry.file); await mkdir(dirname(path), { recursive: true });
    try { await writeFile(path, data, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || hash(await readFile(path)) !== hash(data)) throw error; }
  }
  for (const file of ['tests/crm-stage-transition.emulator.mts', 'tests/fixtures/stage-schedule-worker.mts', 'tests/fixtures/stage-internal-worker.mts']) {
    const path = join(destination, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, await readFile(join(build, file)));
  }
  await symlink(resolve('node_modules'), join(destination, 'node_modules'), 'junction');
  console.log(JSON.stringify({ baselinePrepared: true, baseline: baseline.baseline, files: baseline.files.length }));
} else {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (manifest.reviewed.length !== 1 || manifest.reviewed[0].file !== changed) throw Error('Scope changed');
  const expected = new Map(baseline.files.map(entry => [entry.file, entry.sha]));
  if (manifest.files.length !== expected.size) throw Error('Source count changed');
  for (const entry of manifest.files) {
    if (entry.file === changed) { if (hash(Buffer.from(entry.data, 'base64')) !== manifest.reviewed[0].sha256) throw Error('Candidate changed'); }
    else if (expected.get(entry.file) !== entry.sha) throw Error('Unrelated file changed');
  }
  if (mode === 'validate') {
    const cases = text => {
      const rows = new Map();
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([✔✖]) (.+) \([\d.]+ms\)$/);
        if (match) rows.set(match[2], match[1] === '✔');
      }
      return rows;
    };
    const before = cases(await readFile(join(root, 'order-baseline-tests.log'), 'utf8'));
    const after = cases(await readFile(join(root, 'order-release-tests.log'), 'utf8'));
    if (before.size !== 16 || after.size !== 16) throw Error('Incomplete comparison');
    const improved = [], unchangedFailures = [];
    for (const [name, passed] of before) {
      if (!after.has(name) || (passed && !after.get(name))) throw Error('Regression or missing case');
      if (!passed && after.get(name)) improved.push(name);
      if (!passed && !after.get(name)) unchangedFailures.push(name);
    }
    if (improved.length !== 4 || unchangedFailures.length !== 6) throw Error('Unexpected comparison outcome');
    const focused = [...after].filter(([name]) => name.startsWith('order pipeline'));
    if (focused.length !== 5 || focused.some(([, passed]) => !passed)) throw Error('Order-read contract failed');
    const runtimeTypes = await readFile(join(root, 'order-runtime-only-types.log'), 'utf8');
    const lint = await readFile(join(root, 'order-release-lint.log'), 'utf8');
    if (runtimeTypes.trim() || lint.trim()) throw Error('Runtime static diagnostics');
    const pure = await readFile(join(root, 'order-release-pure-regression.log'), 'utf8');
    if (!/ℹ pass 14\r?\n/.test(pure) || !/ℹ fail 0\r?\n/.test(pure)) throw Error('Pure regression incomplete');
    if (hash(await readFile(join(build, 'tests/crm-stage-transition.emulator.mts'))) !==
        hash(await readFile(join(root, 'baseline-build', 'tests/crm-stage-transition.emulator.mts')))) throw Error('Comparison used different tests');
    if (hash(await readFile(join(build, changed))) !== manifest.reviewed[0].sha256) throw Error('Validated source changed');
    const validation = { baseline: manifest.baseline, sha256: manifest.reviewed[0].sha256,
      approved: true, approvedScope: 'single-file-order-read-recovery-only', broaderSuiteApproved: false,
      baselinePassed: [...before.values()].filter(Boolean).length, candidatePassed: [...after.values()].filter(Boolean).length,
      compared: 16, improved, unchangedFailures, coreContractPassed: 5, purePassed: 14,
      runtimeTypesExit: 0, lintExit: 0, remoteBuildRequiredBeforePromotion: true,
      limits: ['Six unchanged failures concern unmigrated stage-transition/producers; no approval or activation of that migration.',
        'QA-fixture typecheck still requires unpublished stage scheduling export; runtime-only typecheck passed. Original diagnostics preserved.',
        'No real store, model, customer message or full AI quality acceptance.'], validatedAt: new Date().toISOString() };
    await writeFile(join(root, 'validation.json'), JSON.stringify(validation, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(validation));
  } else if (mode === 'deploy') {
    const validation = JSON.parse(await readFile(join(root, 'validation.json'), 'utf8'));
    if (validation.baseline !== manifest.baseline || validation.sha256 !== manifest.reviewed[0].sha256 || !validation.approved) throw Error('Missing candidate validation');
    await unchangedProduction();
    const deployment = await api('/v13/deployments', { name: 'altum', project: manifest.project, target: 'production', autoAssignCustomDomains: false,
      files: manifest.files, meta: { actor: 'codex', purpose: 'order-read-failure-isolation', baselineDeployment: manifest.baseline } });
    const receipt = { id: deployment.id, url: deployment.url, baseline: manifest.baseline, changed: [changed] };
    await writeFile(join(root, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' }); console.log(JSON.stringify(receipt));
  } else {
    const receipt = JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'));
    const deployment = await api(`/v13/deployments/${receipt.id}`);
    if (mode === 'promote') {
      if (deployment.readyState !== 'READY') throw Error('Candidate build not READY');
      await unchangedProduction();
      await execute(process.execPath, [cli, 'promote', receipt.id, '--yes', '--timeout', '60s'], { windowsHide: true, timeout: 90000 });
      if ((await api('/v13/deployments/altumia.com.br')).id !== receipt.id) throw Error('Domain not promoted');
      await writeFile(join(root, 'promoted.json'), JSON.stringify({ ...receipt, promotedAt: new Date().toISOString() }, null, 2));
    }
    if (mode === 'verify') {
      if (deployment.readyState !== 'READY' || (await api('/v13/deployments/altumia.com.br')).id !== receipt.id) throw Error('Domain/version mismatch');
      const tree = await api(`/v6/deployments/${receipt.id}/files`); const entries = new Map();
      function collect(nodes, prefix = '') { for (const node of nodes) { const file = prefix ? `${prefix}/${node.name}` : node.name;
        if (node.type === 'directory') collect(node.children || [], file); else if (node.type === 'file') entries.set(file, node.uid); } }
      collect(tree.find(node => node.name === 'src')?.children || []);
      if (entries.size !== manifest.files.length) throw Error('Published source count differs');
      for (const entry of manifest.files) if (entry.sha && entries.get(entry.file) !== entry.sha) throw Error('Unrelated published source differs');
      const data = await api(`/v8/deployments/${receipt.id}/files/${entries.get(changed)}`);
      if (hash(Buffer.from(data.data, 'base64')) !== manifest.reviewed[0].sha256) throw Error('Published candidate differs');
      const checks = [];
      for (const [path, expectedStatus] of [['/',200], ['/cliente/login',200], ['/cliente/painel/inbox',200], ['/cliente/painel/crm?view=pipeline',200],
        ['/api/tenant/qa-release-nonexistent/chats',401], ['/api/internal/jobs/automations/process',401]]) {
        const response = await fetch(`https://altumia.com.br${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
        checks.push({ path, expected: expectedStatus, actual: response.status }); await response.body?.cancel();
        if (response.status !== expectedStatus) throw Error(`HTTP smoke failed: ${path} (${response.status})`);
      }
      const result = { ...receipt, verifiedAt: new Date().toISOString(), sourceHashesVerified: true, preservedFiles: manifest.files.length - 1,
        authenticatedOrderTested: false, checks };
      await writeFile(join(root, 'verified.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
    } else console.log(JSON.stringify({ id: receipt.id, state: deployment.readyState, error: deployment.errorMessage || null, url: deployment.url }));
  }
}
