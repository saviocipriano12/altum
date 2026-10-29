import path from "node:path";

/** Keep Next defaults, but don't watch this project's generated QA artifacts. */
export function extendInboxQaWatchIgnore(previous, root) {
  if (previous !== undefined && !(previous instanceof RegExp)) throw new Error("Unsupported QA watch ignore configuration");
  const escaped = path.resolve(root, ".qa-artifacts").split(/[\\/]/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\\\/]");
  return new RegExp(`(?:${previous?.source || "$^"})|(?:^${escaped}(?:[\\\\/]|$))`, previous?.flags);
}

// Opt-in local compiler diagnostics. Logs dependency paths, never file contents.
export class InboxQaWatchPlugin {
  constructor(root, report = (value) => console.info(JSON.stringify(value))) {
    this.root = root;
    this.report = report;
  }
  apply(compiler) {
    compiler.hooks.watchRun.tap("InboxQaWatchTrace", () => {
      const relative = (filename) => {
        const name = path.relative(this.root, filename).replaceAll("\\", "/");
        return name.startsWith("../") ? `[external]/${path.basename(filename)}` : name;
      };
      this.report({ localQaWatchTrace: true, compiler: compiler.name || "unknown",
        modified: [...(compiler.modifiedFiles || [])].slice(0, 50).map(relative),
        removed: [...(compiler.removedFiles || [])].slice(0, 50).map(relative) });
    });
  }
}
