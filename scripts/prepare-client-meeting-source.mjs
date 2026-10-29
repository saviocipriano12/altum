import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Download the original upstream, preserve its notices, and execute no upstream code.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "config/client-capability-sources.json"), "utf8"));
const source = manifest.sources.find(item => item.id === "vexa");
if (!source || !/^[a-f0-9]{40}$/.test(source.commit) || source.repository !== "https://github.com/Vexa-ai/vexa") throw new Error("Invalid pinned source");
const target = resolve(root, ".altum-agent-sources/client-meetings/vexa");
const run = promisify(execFile);
const git = async args => (await run("git", args, { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024 })).stdout.trim();
let exists = false;
try { await stat(target); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
if (exists) {
  // Never reset, update, or overwrite another checkout.
  const head = await git(["-C", target, "rev-parse", "HEAD"]);
  if (head !== source.commit) throw new Error("Existing source has a different revision; preserved without changes");
} else {
  await mkdir(dirname(target), { recursive: true });
  await git(["clone", "--depth=1", "--no-checkout", source.repository, target]);
  await git(["-C", target, "fetch", "--depth=1", "origin", source.commit]);
  await git(["-C", target, "checkout", "--detach", source.commit]);
}
const head = await git(["-C", target, "rev-parse", "HEAD"]);
if (head !== source.commit) throw new Error("Pinned revision mismatch");
if (await git(["-C", target, "status", "--porcelain"])) throw new Error("Upstream checkout has local changes; preserved without execution");
const license = await readFile(resolve(target, "LICENSE"), "utf8");
if (!license.includes("Apache License") || !license.includes("Version 2.0")) throw new Error("Unexpected upstream license");
console.log(JSON.stringify({ repository: source.repository, commit: head, path: target, license: source.license, upstreamCodeExecuted: false }));
