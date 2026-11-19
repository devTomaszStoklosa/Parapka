import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../apps/mobile/dist");
const port = Number(process.env["PORT"] ?? 8100);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

/** The file of a request path inside `root`, or the SPA entry for any other path. */
async function fileFor(pathname: string): Promise<string> {
  const candidate = join(root, normalize(decodeURIComponent(pathname)));
  const inside = candidate.startsWith(root);
  const found = inside && (await stat(candidate).catch(() => null));
  return found && found.isFile() ? candidate : join(root, "index.html");
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://web.test");
  fileFor(pathname).then(
    (file) => {
      response.writeHead(200, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      createReadStream(file).pipe(response);
    },
    () => {
      response.writeHead(500).end();
    },
  );
}).listen(port);
