#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// mock-gateway.mjs
// Local development mock for OpenClaw Gateway WebSocket server
//
// Implements the confirmed protocol:
//   • Sends connect.challenge event on open
//   • Handles: connect, config.get, config.patch, config.apply
//   • Returns realistic payloads with hash-based conflict detection
//
// Usage:
//   node mock-gateway.mjs
//   # Listens on ws://localhost:18789
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createHash } from "crypto";

// ── Initial mock config ───────────────────────────────────────────────────────

let currentConfig = {
  agents: {
    list: [
      {
        id: "main",
        default: true,
        workspace: "~/.openclaw/agents/main",
        model: { primary: "claude-opus-4" },
        tools: { allow: ["web", "memory"], deny: [] },
      },
      {
        id: "code-reviewer",
        workspace: "~/.openclaw/agents/code-reviewer",
        model: { primary: "claude-sonnet-4" },
        tools: { allow: ["exec", "filesystem"], deny: ["web"] },
      },
    ],
  },
  bindings: [
    {
      agentId: "code-reviewer",
      match: { channel: "discord", guildId: "1234567890", channelId: "code-review" },
    },
    {
      agentId: "main",
      match: {},
    },
  ],
  session: {
    dmScope: "per-channel-peer",
  },
};

function computeHash(config) {
  return createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex")
    .slice(0, 16);
}

let currentHash = computeHash(currentConfig);

// ── Server setup ──────────────────────────────────────────────────────────────

const server = createServer();
const wss = new WebSocketServer({ server });

console.log("[MockGateway] Starting on ws://localhost:18789");

wss.on("connection", (ws) => {
  let authenticated = false;
  let sessionId = `session-${Date.now()}`;

  console.log("[MockGateway] Client connected");

  // Step 1: Send connect.challenge
  send(ws, {
    type: "event",
    event: "connect.challenge",
    payload: {
      serverVersion: "2026.1.0-mock",
      protocol: 3,
      sessionId,
    },
  });

  ws.on("message", (data) => {
    let frame;
    try {
      frame = JSON.parse(data.toString());
    } catch {
      console.error("[MockGateway] Invalid JSON:", data.toString());
      return;
    }

    if (frame.type !== "req") return;

    const { id, method, params } = frame;
    console.log(`[MockGateway] → ${method} (${id})`);

    switch (method) {
      case "connect":
        handleConnect(ws, id, params, () => { authenticated = true; });
        break;
      case "config.get":
        if (!checkAuth(ws, id, authenticated)) return;
        handleConfigGet(ws, id);
        break;
      case "config.patch":
        if (!checkAuth(ws, id, authenticated)) return;
        handleConfigPatch(ws, id, params);
        break;
      case "config.apply":
        if (!checkAuth(ws, id, authenticated)) return;
        handleConfigApply(ws, id, params);
        break;
      default:
        sendError(ws, id, "METHOD_NOT_FOUND", `Unknown method: ${method}`);
    }
  });

  ws.on("close", () => {
    console.log("[MockGateway] Client disconnected");
  });
});

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleConnect(ws, id, params, onSuccess) {
  // Validate role
  if (params?.role !== "operator") {
    return sendError(ws, id, "AUTH_FAILED", "role must be 'operator'");
  }
  // Accept any token for mock purposes
  onSuccess();
  sendOk(ws, id, {
    protocol: 3,
    sessionId: `session-${Date.now()}`,
    serverVersion: "2026.1.0-mock",
    permissions: { "config.read": true, "config.write": true },
  });
  console.log("[MockGateway] Client authenticated");
}

function handleConfigGet(ws, id) {
  const raw = JSON.stringify(currentConfig, null, 2);
  sendOk(ws, id, {
    path: "/home/user/.openclaw/openclaw.json",
    exists: true,
    raw,
    parsed: currentConfig,
    resolved: currentConfig,
    valid: true,
    config: currentConfig,
    hash: currentHash,
    issues: [],
    warnings: [],
    legacyIssues: [],
  });
}

function handleConfigPatch(ws, id, params) {
  // Check baseHash for conflict detection
  if (params?.baseHash && params.baseHash !== currentHash) {
    return sendError(ws, id, "HASH_MISMATCH",
      `Config has changed since your last config.get. Re-run config.get and retry.`,
      false, { expectedHash: params.baseHash, currentHash }
    );
  }

  // Parse the raw JSON5 patch (simplified: treat as JSON for mock)
  let patch;
  try {
    patch = JSON.parse(params.raw);
  } catch {
    return sendError(ws, id, "INVALID_REQUEST", `Failed to parse raw patch as JSON: ${params.raw?.slice(0, 100)}`);
  }

  // Deep merge patch into current config
  currentConfig = deepMerge(currentConfig, patch);
  currentHash = computeHash(currentConfig);

  console.log(`[MockGateway] Config patched. New hash: ${currentHash}`);
  if (params.note) console.log(`[MockGateway] Note: ${params.note}`);

  // Simulate restart after delay
  const restartDelay = params.restartDelayMs ?? 2000;
  setTimeout(() => {
    console.log("[MockGateway] Simulating gateway restart...");
    wss.clients.forEach(client => {
      send(client, {
        type: "event",
        event: "gateway.restarted",
        payload: { reason: "config_patch", hash: currentHash },
      });
      send(client, {
        type: "event",
        event: "config.changed",
        payload: { hash: currentHash },
      });
    });
  }, restartDelay);

  sendOk(ws, id, {
    ok: true,
    path: "/home/user/.openclaw/openclaw.json",
    config: currentConfig,
    restart: { scheduledIn: restartDelay },
    sentinel: { path: "/tmp/openclaw.sentinel", payload: { hash: currentHash } },
  });
}

function handleConfigApply(ws, id, params) {
  // Same as patch but full replace
  if (params?.baseHash && params.baseHash !== currentHash) {
    return sendError(ws, id, "HASH_MISMATCH",
      "Config has changed. Re-run config.get and retry.",
    );
  }

  let newConfig;
  try {
    newConfig = JSON.parse(params.raw);
  } catch {
    return sendError(ws, id, "INVALID_REQUEST", `Failed to parse raw config as JSON`);
  }

  currentConfig = newConfig;
  currentHash = computeHash(currentConfig);

  console.log(`[MockGateway] Config applied (full replace). New hash: ${currentHash}`);
  sendOk(ws, id, {
    ok: true,
    path: "/home/user/.openclaw/openclaw.json",
    config: currentConfig,
    restart: { scheduledIn: params.restartDelayMs ?? 2000 },
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function send(ws, frame) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}

function sendOk(ws, id, payload) {
  send(ws, { type: "res", id, ok: true, payload });
}

function sendError(ws, id, code, message, retryable = false, details = undefined) {
  send(ws, {
    type: "res", id, ok: false,
    error: { code, message, retryable, details },
  });
}

function checkAuth(ws, id, authenticated) {
  if (!authenticated) {
    sendError(ws, id, "AUTH_REQUIRED", "Must send connect request first");
    return false;
  }
  return true;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(18789, "127.0.0.1", () => {
  console.log("[MockGateway] Listening on ws://127.0.0.1:18789");
  console.log("[MockGateway] Press Ctrl+C to stop");
});
