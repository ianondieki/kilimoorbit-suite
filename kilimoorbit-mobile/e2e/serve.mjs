/**
 * Serves the static web export (dist-e2e/) for the Playwright suite, with an
 * SPA fallback so deep links like /masoko load index.html. Dependency-free.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist-e2e/", import.meta.url));
const port = Number(process.env.PORT || 8085);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url || "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  try {
    if (!(await stat(file)).isFile()) file = join(file, "index.html");
    await stat(file);
  } catch {
    file = join(root, "index.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`e2e static server on http://localhost:${port}`));
