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
  const origin  = process.env.NODE_ENV === "production" ? "*" : "http://localhost:5173";
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin":  origin,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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

  const report = {
    id: agentId,
    cronRemoved: [],
    cronErrors: [],
    deleteSummary: null,
    gatewayRestarted: false,
  };

  let gatewayStopped = false;
  try {
    // 1) Remove cron jobs for this agent while gateway is up
    try {
      const listed = await runOpenclaw(["cron", "list", "--json"], 120000);
      const parsed = JSON.parse(listed.stdout || "{}");
      const jobs = parsed?.jobs || [];
      const targets = jobs.filter(j => j?.agentId === agentId).map(j => j.id).filter(Boolean);
      for (const id of targets) {
        try {
          await runOpenclaw(["cron", "rm", id, "--json"], 120000);
          report.cronRemoved.push(id);
        } catch (e) {
          report.cronErrors.push(`cron ${id}: ${e?.message ?? String(e)}`);
        }
      }
    } catch (e) {
      report.cronErrors.push(`cron list failed: ${e?.message ?? String(e)}`);
    }

    // 2) Stop gateway (maintenance mode)
    await runOpenclaw(["gateway", "stop"], 120000);
    gatewayStopped = true;

    // 3) Delete agent (config + files + sessions)
    const del = await runOpenclaw(["agents", "delete", agentId, "--force", "--json"], 120000);
    try {
      report.deleteSummary = JSON.parse(del.stdout || "{}");
    } catch {
      report.deleteSummary = { raw: del.stdout };
    }

    // 4) Start gateway again
    await runOpenclaw(["gateway", "start"], 120000);
    report.gatewayRestarted = true;

    return json(res, 200, { ok: true, report });
  } catch (e) {
    // best effort: if we stopped it, try to start back
    if (gatewayStopped) {
      try {
        await runOpenclaw(["gateway", "start"], 120000);
        report.gatewayRestarted = true;
      } catch {}
    }
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
      "Access-Control-Allow-Origin": "http://localhost:5173",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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
