import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { InboxQaWatchPlugin, extendInboxQaWatchIgnore } from "../scripts/inbox-qa-watch-plugin.mjs";

test("QA output is ignored without hiding source in a nested QA snapshot", () => {
  const root = path.resolve(".qa-artifacts", "snapshot-for-test");
  const ignored = extendInboxQaWatchIgnore(/node_modules|\.git/, root);
  assert.equal(ignored.test(path.join(root, ".qa-artifacts")), true);
  assert.equal(ignored.test(path.join(root, ".qa-artifacts", "next-inbox", "dev", "build-manifest.json")), true);
  assert.equal(ignored.test(path.join(root, "app", "page.tsx")), false);
  assert.equal(ignored.test(path.join(root, ".qa-artifacts-other", "source.ts")), false);
  assert.equal(ignored.test(path.join(root, "node_modules", "next", "index.js")), true);
  assert.equal(ignored.test(path.join(root, ".git", "index")), true);
});

test("watch ignore handles both slash styles and rejects unsupported replacement types", () => {
  const root = path.resolve("qa-root");
  const ignored = extendInboxQaWatchIgnore(undefined, root);
  const output = path.join(root, ".qa-artifacts", "next-inbox");
  assert.equal(ignored.test(output.replaceAll("\\", "/")), true);
  assert.equal(ignored.test(output.replaceAll("/", "\\")), true);
  assert.throws(() => extendInboxQaWatchIgnore(["some-glob"], root), /Unsupported/);
});

test("watch tracing reports bounded relative paths without reading file contents", () => {
  const reports: unknown[] = [];
  const root = path.resolve("qa-root");
  const compiler = { name: "server", modifiedFiles: new Set([path.join(root, "app", "page.tsx"), path.resolve("outside.ts")]),
    removedFiles: new Set<string>(), hooks: { watchRun: { tap(_name: string, callback: () => void) { callback(); } } } };
  new InboxQaWatchPlugin(root, (value: unknown) => reports.push(value)).apply(compiler);
  assert.deepEqual(reports, [{ localQaWatchTrace: true, compiler: "server", modified: ["app/page.tsx", "[external]/outside.ts"], removed: [] }]);
});

test("watch tracing handles startup without changed-file sets", () => {
  const reports: unknown[] = [];
  new InboxQaWatchPlugin(process.cwd(), (value: unknown) => reports.push(value)).apply({ hooks: { watchRun: { tap(_name: string, cb: () => void) { cb(); } } } });
  assert.deepEqual(reports[0], { localQaWatchTrace: true, compiler: "unknown", modified: [], removed: [] });
});
