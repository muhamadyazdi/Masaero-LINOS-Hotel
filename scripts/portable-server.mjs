import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMemoryStore } from "../src/adapters/memory.mjs";
import { asLinosError, LinosError } from "../src/core/errors.mjs";
import { identityFromRequest } from "../src/core/identity.mjs";
import { HotelService } from "../src/core/service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 8787);

process.env.LINOS_LOCAL_DEV_EMAIL = process.env.LINOS_LOCAL_DEV_EMAIL || "supervisor@linos.hotel";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const service = new HotelService(getMemoryStore());
service.ensureDemo();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new LinosError(400, "ERR-HTTP-001", "The request body is not valid JSON.");
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(publicDir, urlPath);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const apiPath = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/";
      const method = req.method || "GET";

      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (method === "GET" && apiPath === "/health") {
        sendJson(res, 200, { ok: true, service: "linos-hotel", phase: 1 });
        return;
      }

      const body = method === "GET" || method === "HEAD" ? {} : await readBody(req);
      const headers = Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      );
      const query = Object.fromEntries(url.searchParams.entries());

      if (method === "POST" && apiPath === "/auth/local") {
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) throw new LinosError(400, "ERR-AUTH-010", "Email is required.");
        const session = service.session({ email, sub: `local:${email}`, source: "local-login" }, "");
        sendJson(res, 200, { ok: true, token: `local:${email}`, session });
        return;
      }

      const event = { headers, queryStringParameters: query };
      const identity = identityFromRequest(event, {});
      const result = service.handle(identity, method, apiPath, body, query, headers);
      sendJson(res, 200, result);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    const linos = asLinosError(error);
    sendJson(res, linos.status || 500, linos.toJSON());
  }
});

server.listen(port, () => {
  console.log(`LINOS Hotel listening on http://localhost:${port}`);
  console.log(`Local demo users: supervisor@linos.hotel (Room Supervisor), agent1@linos.hotel (Room Agent)`);
});
