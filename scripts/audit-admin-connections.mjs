import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const normalize = file => file.replaceAll('\\', '/');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [normalize(path.join(dir, entry.name))]))).flat();
}
const cache = new Map();
async function inspect(file) {
  if (cache.has(file)) return cache.get(file);
  const source = await readFile(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = [], requests = [], collections = [], auth = [], methods = [];
  const line = node => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isFunctionDeclaration(node) && node.name && /^(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)$/.test(node.name.text)) methods.push(node.name.text);
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(ast);
      if (['authedFetch', 'fetch', 'requestJson', 'requestApi'].includes(callee)) {
        const argument = node.arguments[0];
        if (argument) {
          const expression = argument.getText(ast);
          let reference = null;
          if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) reference = argument.text;
          if (ts.isTemplateExpression(argument)) reference = argument.head.text + argument.templateSpans.map(span => '{dynamic}' + span.literal.text).join('');
          const options = node.arguments[1];
          const methodProperty = options && ts.isObjectLiteralExpression(options) ? options.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(ast).replace(/["']/g, '') === 'method') : null;
          const method = methodProperty && ts.isStringLiteral(methodProperty.initializer) ? methodProperty.initializer.text : ['requestJson', 'requestApi'].includes(callee) ? 'POST' : 'GET';
          requests.push({ file, line: line(node), callee, expression, reference, method });
        }
      }
      if (callee.endsWith('.collection') || callee === 'collection') {
        const argument = node.arguments[callee === 'collection' ? 1 : 0];
        if (argument && ts.isStringLiteral(argument)) collections.push(argument.text);
      }
      if (['requireRequestUser', 'assertTenantAccess', 'assertTenantCapability', 'assertTenantModule', 'assertTenantRole'].includes(callee)) auth.push({ guard: callee, line: line(node), arguments: node.arguments.map(arg => arg.getText(ast)) });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const result = { file, lines: source.split('\n').length, imports, requests, collections: [...new Set(collections)], auth, methods };
  cache.set(file, result);
  return result;
}
async function resolveImport(file, specifier) {
  if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return null;
  const base = specifier.startsWith('@/') ? specifier.slice(2) : normalize(path.join(path.dirname(file), specifier));
  for (const candidate of [base, ...['.ts', '.tsx', '.mjs', '/index.ts', '/index.tsx'].map(ext => base + ext)]) {
    try { if ((await stat(candidate)).isFile()) return normalize(candidate); } catch { /* absent candidate */ }
  }
  return null;
}
const routeFiles = (await files('app/api')).filter(file => file.endsWith('/route.ts'));
const routes = await Promise.all(routeFiles.map(inspect));
const escape = segment => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const routePattern = file => new RegExp('^/' + path.dirname(file).replaceAll('\\', '/').replace(/^app\//, '').split('/').map(segment => segment.startsWith('[...') ? '.+' : segment.startsWith('[[...') ? '.*' : segment.startsWith('[') ? '[^/]+' : escape(segment)).join('/') + '$');
function mapRequest(request) {
  if (!request.reference?.startsWith('/api/')) return { ...request, status: 'manual_review_computed_or_external', routes: [] };
  const pathname = request.reference.split('?')[0];
  const candidates = routes.filter(route => routePattern(route.file).test(pathname));
  return { ...request, status: candidates.length ? candidates.some(route => route.methods.includes(request.method)) ? 'route_exists_static_only' : 'http_method_missing_static' : 'manual_review_unresolved', routes: candidates.map(route => ({ file: route.file, methods: route.methods, collections: route.collections, auth: route.auth })) };
}
const screens = [];
for (const file of (await files('app/admin')).filter(file => file.endsWith('/page.tsx'))) {
  const seen = new Set();
  async function dependencies(current) {
    if (seen.has(current) || !/\.(tsx?|mjs)$/.test(current)) return;
    seen.add(current);
    const inspected = await inspect(current);
    for (const specifier of inspected.imports) {
      const resolved = await resolveImport(current, specifier);
      if (resolved && !resolved.startsWith('app/api/')) await dependencies(resolved);
    }
  }
  await dependencies(file);
  const source = await inspect(file);
  const dependenciesList = [...seen].filter(item => item !== file);
  const requests = [...seen].flatMap(item => cache.get(item).requests.map(mapRequest));
  screens.push({ file, route: '/' + path.dirname(file).replace(/^app\//, ''), lines: source.lines,
    draft: file.startsWith('app/admin/midia/'), dependencies: dependenciesList,
    directRequests: source.requests.map(mapRequest), transitiveRequests: requests,
    note: 'Static inventory: existence is not runtime validation; computed URLs and HTTP methods need review.' });
}
await writeFile('docs/admin-audit-inventory.json', JSON.stringify(screens, null, 2) + '\n');
await writeFile('docs/admin-audit-api-inventory.json', JSON.stringify(routes.filter(route => route.file.startsWith('app/api/admin/')), null, 2) + '\n');
const direct = screens.flatMap(screen => screen.directRequests);
const summary = { screens: screens.length, existingScreens: screens.filter(screen => !screen.draft).length, adminApis: routes.filter(route => route.file.startsWith('app/api/admin/')).length,
  directRequests: direct.length, mappedDirectRequests: direct.filter(request => request.status === 'route_exists_static_only').length,
  manualReview: direct.filter(request => request.status !== 'route_exists_static_only').map(({ file, line, expression, status }) => ({ file, line, expression, status })) };
await writeFile('docs/admin-audit-summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
