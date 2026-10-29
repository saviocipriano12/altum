import { createServer } from "node:http";
import { build } from "esbuild";

const port = 3188;
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Altum Inbox Local Lab</title><style>body{font:14px system-ui;margin:0;background:#f4f6fa;color:#17253a}main{max-width:980px;margin:auto;padding:16px}button{min-height:40px;margin:4px;border:1px solid #adb7ca;border-radius:8px;background:white;padding:6px 12px}textarea{display:block;box-sizing:border-box;width:100%;min-height:80px;margin:8px 0}nav{display:flex;flex-wrap:wrap}article{background:white}p{line-height:1.5}</style><div id="root"></div><script src="/lab.js"></script></html>`;
const server = createServer(async (req, res) => {
  if (req.url === "/lab.js") {
    try {
      const result = await build({ entryPoints: ["tests/fixtures/inbox-resilience.tsx"], bundle: true,
        write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      res.end(result.outputFiles[0].text);
    } catch { res.writeHead(500); res.end("Laboratory bundle failed"); }
    return;
  }
  if (req.url !== "/") { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
});
server.listen(port, "127.0.0.1", () => console.log(`Isolated Inbox hook lab: http://127.0.0.1:${port}`));
