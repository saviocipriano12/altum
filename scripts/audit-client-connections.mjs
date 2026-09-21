import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}
const normalized = file => file.replaceAll('\\', '/');
const routes = (await files('app/api')).filter(file => file.endsWith('route.ts')).map(file => {
  const url = '/' + normalized(path.dirname(file)).replace(/^app\//, '');
  const pattern = url.split('/').map(segment => segment.startsWith('[') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
  return { file: normalized(file), regex: new RegExp('^' + pattern + '$') };
});
const connections = [];
for (const file of (await files('app/cliente')).filter(file => /\.[jt]sx?$/.test(file))) {
  const source = await readFile(file, 'utf8');
  for (const reference of new Set([...source.matchAll(/[`"'](\/api\/[^`"'\s]*)[`"']/g)].map(match => match[1]))) {
    const requestPath = reference.split('?')[0].replace(/\$\{[^}]*\}/g, 'dynamic');
    const resolvedRoutes = routes.filter(route => route.regex.test(requestPath)).map(route => route.file);
    connections.push({ source: normalized(file), reference, resolvedRoutes, status: resolvedRoutes.length ? 'route_exists_static_check' : 'manual_review_dynamic_expression' });
  }
}
await writeFile('docs/client-audit-connections.json', JSON.stringify(connections, null, 2) + '\n');
console.log(JSON.stringify({ references: connections.length, mapped: connections.filter(item => item.resolvedRoutes.length).length, manualReview: connections.filter(item => !item.resolvedRoutes.length) }, null, 2));
