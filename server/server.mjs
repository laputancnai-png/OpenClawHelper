// ─────────────────────────────────────────────────────────────────────────────
// OpenClawHelper — Local File Server
// Handles SOUL.md (and other workspace markdown files) read/write.
// Gateway WS (config.get/patch) is handled directly by the browser.
//
// Port: 3131  (intentionally different from Gateway's 18789)
// Security: localhost only — never binds to 0.0.0.0
//
// Endpoints:
//   GET  /api/workspace              → list workspace files + agent dirs
//   GET  /api/file?path=<rel>        → read a file (relative to workspace)
//   PUT  /api/file?path=<rel>        → write a file (creates dirs if needed)
//   GET  /api/health                 → { ok: true, workspace }
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import os from "os";
import { createReadStream } from "fs";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR  = path.resolve(__dirname, "../dist"); // Vite build output

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = 3131;
const HOST = "127.0.0.1"; // loopback only — never expose externally
const execFileAsync = promisify(execFile);

// Resolve workspace: honours OPENCLAW_WORKSPACE env var, else default
const WORKSPACE = process.env.OPENCLAW_WORKSPACE
  ?? path.join(os.homedir(), ".openclaw", "workspace");
const OPENCLAW_HOME = path.dirname(WORKSPACE);

// Files we allow reading/writing (whitelist approach — security matters)
const ALLOWED_FILES = new Set([
  "SOUL.md",
  "AGENTS.md",
  "IDENTITY.md",
  "USER.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve and validate a relative path stays inside WORKSPACE.
 * Returns absolute path or throws if path escapes workspace (path traversal).
 */
function resolveSafe(relPath) {
  // Normalise and resolve relative to OpenClaw home (~/.openclaw)
  const clean = path.normalize(relPath).replace(/^[/\\]+/, "");
  const abs = path.resolve(OPENCLAW_HOME, clean);

  // Must stay inside OpenClaw home
  if (!abs.startsWith(OPENCLAW_HOME + path.sep) && abs !== OPENCLAW_HOME) {
    throw new Error(`Path escapes OpenClaw home: ${relPath}`);
  }

  // Filename must be in allowlist
  const filename = path.basename(abs);
  if (!ALLOWED_FILES.has(filename)) {
    throw new Error(`File not permitted: ${filename}. Allowed: ${[...ALLOWED_FILES].join(", ")}`);
  }

  return abs;
}

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function deepMerge(target, patch) {
  if (Array.isArray(patch)) return patch;
  if (patch && typeof patch === "object") {
    const out = (target && typeof target === "object" && !Array.isArray(target)) ? { ...target } : {};
    for (const [k, v] of Object.entries(patch)) {
      out[k] = deepMerge(out[k], v);
    }
    return out;
  }
  return patch;
}

async function runOpenclaw(args, timeoutMs = 120000) {
  const { stdout, stderr } = await execFileAsync("openclaw", args, {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { stdout: stdout?.toString?.() ?? "", stderr: stderr?.toString?.() ?? "" };
}


// ── Route handlers ────────────────────────────────────────────────────────────

/** GET /api/health */
async function handleHealth(req, res) {
  let workspaceExists = false;
  try {
    await fs.access(WORKSPACE);
    workspaceExists = true;
  } catch {}

  json(res, 200, {
    ok: true,
    workspace: WORKSPACE,
    workspaceExists,
    port: PORT,
    version: "0.1.0",
  });
}

/** GET /api/gateway-token */
async function handleGatewayToken(req, res) {
  try {
    const cfgPath = path.join(OPENCLAW_HOME, "openclaw.json");
    const raw = await fs.readFile(cfgPath, "utf8");
    const cfg = JSON.parse(raw);
    const token = cfg?.gateway?.auth?.token || cfg?.gateway?.remote?.token || "";
    json(res, 200, { token });
  } catch (e) {
    json(res, 500, { error: e?.message ?? String(e), token: "" });
  }
}

/** POST /api/gateway-rpc */
async function handleGatewayRpc(req, res) {
  try {
    const body = await readBody(req);
    const frame = JSON.parse(body || "{}");
    const method = String(frame?.method || "");
    const params = frame?.params || {};
    const cfgPath = path.join(OPENCLAW_HOME, "openclaw.json");

    if (method === "config.get") {
      const raw = await fs.readFile(cfgPath, "utf8");
      const config = JSON.parse(raw);
      return json(res, 200, { ok: true, payload: { path: cfgPath, hash: sha256(raw), config } });
    }

    if (method === "config.patch") {
      const raw = await fs.readFile(cfgPath, "utf8");
      const oldHash = sha256(raw);
      if (params?.baseHash && params.baseHash !== oldHash) {
        return json(res, 409, { ok: false, error: { code: "BASE_HASH_MISMATCH", message: "Config changed, refresh and retry." } });
      }
      const config = JSON.parse(raw);
      const patch = JSON.parse(String(params?.raw || "{}"));
      const merged = deepMerge(config, patch);
      const nextRaw = JSON.stringify(merged, null, 2);
      await fs.writeFile(cfgPath, nextRaw, "utf8");
      try { await runOpenclaw(["gateway", "restart"], 120000); } catch {}
      return json(res, 200, { ok: true, payload: { changed: true, hash: sha256(nextRaw) } });
    }

    if (method === "sessions.list") {
      return json(res, 200, { ok: true, payload: { sessions: [] } });
    }

    if (method === "sessions.delete") {
      return json(res, 200, { ok: true, payload: { ok: true, key: params?.key || "", deleted: true } });
    }

    if (method === "cron.list") {
      const out = await runOpenclaw(["cron", "list", "--json"], 120000);
      const parsed = JSON.parse(out.stdout || "{}");
      return json(res, 200, { ok: true, payload: parsed });
    }

    if (method === "cron.rm") {
      const id = String(params?.id || "");
      const out = await runOpenclaw(["cron", "rm", id, "--json"], 120000);
      let parsed;
      try { parsed = JSON.parse(out.stdout || "{}"); } catch { parsed = { ok: true }; }
      return json(res, 200, { ok: true, payload: parsed });
    }

    return json(res, 404, { ok: false, error: { code: "METHOD_NOT_FOUND", message: `Unknown RPC method: ${method}` } });
  } catch (e) {
    return json(res, 500, { ok: false, error: { code: "RPC_ERROR", message: e?.message ?? String(e) } });
  }
}

/**
 * GET /api/workspace
 * Returns list of agents (from agents/<id>/ subdirs) and which workspace-<id>/SOUL.md files exist.
 */
async function handleWorkspace(req, res) {
  // Read main workspace files
  const rootFiles = {};
  for (const name of ALLOWED_FILES) {
    const abs = path.join(WORKSPACE, name);
    try {
      const stat = await fs.stat(abs);
      rootFiles[name] = { exists: true, size: stat.size, mtime: stat.mtime };
    } catch {
      rootFiles[name] = { exists: false };
    }
  }

  // Discover agents from ~/.openclaw/agents/<id>/ and map SOUL to workspace-<id>/SOUL.md
  const agentsMetaDir = path.join(OPENCLAW_HOME, "agents");
  const agents = [];
  try {
    const entries = await fs.readdir(agentsMetaDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const agentId = entry.name;
      const soulPath = path.join(OPENCLAW_HOME, `workspace-${agentId}`, "SOUL.md");
      let hasSoul = false;
      try {
        await fs.access(soulPath);
        hasSoul = true;
      } catch {}
      agents.push({ id: agentId, hasSoul, soulRelPath: `workspace-${agentId}/SOUL.md` });
    }
  } catch {
    // agents/ doesn't exist yet — fine
  }

  json(res, 200, { workspace: WORKSPACE, rootFiles, agents });
}

/**
 * GET /api/file?path=workspace-main/SOUL.md
 * GET /api/file?path=workspace-writer/SOUL.md
 */
async function handleFileRead(req, res, relPath) {
  if (!relPath) return json(res, 400, { error: "path query param required" });

  let abs;
  try {
    abs = resolveSafe(relPath);
  } catch (e) {
    return json(res, 403, { error: e.message });
  }

  try {
    const content = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    json(res, 200, { path: relPath, content, size: stat.size, mtime: stat.mtime });
  } catch (e) {
    if (e.code === "ENOENT") {
      json(res, 404, { error: `File not found: ${relPath}`, path: relPath, content: "" });
    } else {
      json(res, 500, { error: e.message });
    }
  }
}

/**
 * PUT /api/file?path=workspace-main/SOUL.md
 * Body: plain text content of the file
 */
async function handleFileWrite(req, res, relPath) {
  if (!relPath) return json(res, 400, { error: "path query param required" });

  let abs;
  try {
    abs = resolveSafe(relPath);
  } catch (e) {
    return json(res, 403, { error: e.message });
  }

  let content;
  try {
    content = await readBody(req);
  } catch (e) {
    return json(res, 400, { error: `Failed to read request body: ${e.message}` });
  }

  try {
    // Ensure parent directory exists (e.g. workspace-writer/)
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    const stat = await fs.stat(abs);
    console.log(`[FileServer] Written: ${relPath} (${stat.size} bytes)`);
    json(res, 200, { ok: true, path: relPath, size: stat.size });
  } catch (e) {
    console.error(`[FileServer] Write failed: ${relPath}`, e.message);
    json(res, 500, { error: e.message });
  }
}

/**
 * DELETE /api/agent?id=<agentId>
 * Removes:
 *   ~/.openclaw/workspace-<id>
 *   ~/.openclaw/agents/<id>
 */
async function handleAgentDelete(req, res, agentId) {
  if (!agentId) return json(res, 400, { error: "id query param required" });
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return json(res, 400, { error: "invalid agent id" });
  }
  if (agentId === "main") return json(res, 400, { error: "main agent cannot be deleted" });

  const report = { id: agentId, cronRemoved: [], removed: [], missing: [] };

  try {
    // 1) Normalize agents.list and remove target agent
    const listOut = await runOpenclaw(["config", "get", "agents.list", "--json"]);
    const currList = JSON.parse(listOut.stdout || "[]");
    const nextList = (Array.isArray(currList) ? currList : [])
      .filter((a) => a?.id !== agentId)
      .map((a) => a?.id === "main"
        ? { ...a, workspace: `${OPENCLAW_HOME}/workspace`, agentDir: `${OPENCLAW_HOME}/agents/main/agent` }
        : a
      );
    await runOpenclaw(["config", "set", "agents.list", JSON.stringify(nextList), "--strict-json"]);

    // 2) Remove bindings for target agent
    try {
      const bindOut = await runOpenclaw(["config", "get", "bindings", "--json"]);
      const currBindings = JSON.parse(bindOut.stdout || "[]");
      const nextBindings = (Array.isArray(currBindings) ? currBindings : []).filter((b) => b?.agentId !== agentId);
      await runOpenclaw(["config", "set", "bindings", JSON.stringify(nextBindings), "--strict-json"]);
    } catch {
      // ignore bindings if absent
    }

    // 3) Remove cron jobs for this agent (default)
    try {
      const cronOut = await runOpenclaw(["cron", "list", "--json"]);
      const cron = JSON.parse(cronOut.stdout || "{}");
      const jobs = cron?.jobs || [];
      for (const j of jobs) {
        if (j?.agentId === agentId && j?.id) {
          try {
            await runOpenclaw(["cron", "rm", String(j.id), "--json"]);
            report.cronRemoved.push(String(j.id));
          } catch {
            // best effort
          }
        }
      }
    } catch {
      // ignore cron failures
    }

    // 4) Remove directories
    const targets = [
      path.join(OPENCLAW_HOME, `workspace-${agentId}`),
      path.join(OPENCLAW_HOME, "agents", agentId),
    ];

    for (const t of targets) {
      if (!t.startsWith(OPENCLAW_HOME + path.sep)) {
        throw new Error(`Unsafe delete path: ${t}`);
      }
      try {
        await fs.rm(t, { recursive: true, force: false });
        report.removed.push(t);
      } catch (e) {
        if (e?.code === "ENOENT") {
          report.missing.push(t);
        } else {
          throw e;
        }
      }
    }

    // 5) Restart gateway to apply and stabilize
    try { await runOpenclaw(["gateway", "restart"]); } catch {}

    return json(res, 200, { ok: true, report });
  } catch (e) {
    return json(res, 500, { error: e?.message ?? String(e), report });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = url.pathname;
  const relPath = url.searchParams.get("path") ?? "";
  const agentId = url.searchParams.get("id") ?? "";

  console.log(`[FileServer] ${req.method} ${pathname}${relPath ? `?path=${relPath}` : ""}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      return await handleHealth(req, res);
    }
    if (pathname === "/api/workspace" && req.method === "GET") {
      return await handleWorkspace(req, res);
    }
    if (pathname === "/api/gateway-token" && req.method === "GET") {
      return await handleGatewayToken(req, res);
    }
    if (pathname === "/api/gateway-rpc" && req.method === "POST") {
      return await handleGatewayRpc(req, res);
    }
    if (pathname === "/api/file" && req.method === "GET") {
      return await handleFileRead(req, res, relPath);
    }
    if (pathname === "/api/file" && req.method === "PUT") {
      return await handleFileWrite(req, res, relPath);
    }
    if (pathname === "/api/agent" && req.method === "DELETE") {
      return await handleAgentDelete(req, res, agentId);
    }
    // ── Static files (production build) ─────────────────────────────────────
    if (req.method === "GET" && fssync.existsSync(DIST_DIR)) {
      const MIME = {
        ".html": "text/html", ".js": "application/javascript",
        ".css": "text/css",   ".svg": "image/svg+xml",
        ".png": "image/png",  ".ico": "image/x-icon",
        ".woff2": "font/woff2",
      };
      // Try exact file, then index.html (SPA fallback)
      const candidates = [
        path.join(DIST_DIR, pathname),
        path.join(DIST_DIR, "index.html"),
      ];
      for (const candidate of candidates) {
        if (fssync.existsSync(candidate) && fssync.statSync(candidate).isFile()) {
          const ext  = path.extname(candidate);
          const mime = MIME[ext] ?? "application/octet-stream";
          res.writeHead(200, { "Content-Type": mime });
          createReadStream(candidate).pipe(res);
          return;
        }
      }
    }

    json(res, 404, { error: `Unknown endpoint: ${req.method} ${pathname}` });
  } catch (e) {
    console.error("[FileServer] Unhandled error:", e);
    json(res, 500, { error: "Internal server error" });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   OpenClawHelper File Server                 ║
║   http://${HOST}:${PORT}                     ║
║   Workspace: ${WORKSPACE.slice(0, 32)}...    ║
╚══════════════════════════════════════════════╝

Endpoints:
  GET  /api/health
  GET  /api/workspace
  GET  /api/gateway-token
  GET  /api/file?path=workspace-main/SOUL.md
  PUT  /api/file?path=workspace-main/SOUL.md
  PUT  /api/file?path=workspace-writer/SOUL.md
`);
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`[FileServer] Port ${PORT} already in use. Is server already running?`);
  } else {
    console.error("[FileServer] Server error:", e);
  }
  process.exit(1);
});
