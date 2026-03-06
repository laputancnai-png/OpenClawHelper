// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Gateway WebSocket Protocol Types
// Source: confirmed from local openclaw gateway call output + type stubs
// Protocol version: 3
// ─────────────────────────────────────────────────────────────────────────────

// ── Wire frames ───────────────────────────────────────────────────────────────

export type ReqFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type ResFrame<T = unknown> =
  | {
      type: "res";
      id: string;
      ok: true;
      payload?: T;
    }
  | {
      type: "res";
      id: string;
      ok: false;
      error: GatewayError;
    };

export type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: unknown;
};

export type GatewayFrame = ReqFrame | ResFrame | EventFrame;

// ── Errors ────────────────────────────────────────────────────────────────────

export type GatewayError = {
  code: string;         // e.g. "INVALID_REQUEST", "HASH_MISMATCH", "AUTH_FAILED"
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
};

// ── Handshake ─────────────────────────────────────────────────────────────────

// Gateway sends this first after WS open
export type ConnectChallengePayload = {
  serverVersion?: string;
  protocol?: number;
  sessionId?: string;
};

// Client responds with this as a "connect" req
export type ConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: "operator";
  };
  role: "operator";
  scopes: string[];
  caps: string[];
  commands: string[];
  permissions: Record<string, unknown>;
  auth?: { token?: string; password?: string };
  locale?: string;
  userAgent?: string;
};

export type ConnectResult = {
  protocol: number;
  sessionId: string;
  serverVersion?: string;
  permissions?: Record<string, unknown>;
};

// ── config.get ────────────────────────────────────────────────────────────────

export type ConfigGetParams = Record<string, never>;

export type ConfigIssue = {
  path?: string;
  message: string;
};

export type ConfigSnapshot = {
  path: string;
  exists: boolean;
  raw: string | null;               // JSON5 string of the on-disk file
  parsed: Record<string, unknown> | null;
  resolved: Record<string, unknown>;
  valid: boolean;
  config: OpenClawConfig;
  hash: string;                     // CRITICAL: must be passed as baseHash in patch/apply
  issues: ConfigIssue[];
  warnings: ConfigIssue[];
  legacyIssues: ConfigIssue[];
};

// ── config.patch / config.apply ───────────────────────────────────────────────

// NOTE: raw is JSON5 string, NOT a plain object
export type ConfigMutateParams = {
  raw: string;              // JSON5 string — patch: deep-merged; apply: full replace
  baseHash: string;         // From config.get payload.hash — prevents concurrent overwrites
  sessionKey?: string;      // e.g. "agent:main:..."
  note?: string;            // Human-readable description shown in audit log
  restartDelayMs?: number;  // Default 2000; time before gateway restarts after write
};

export type ConfigPatchParams = ConfigMutateParams;
export type ConfigApplyParams = ConfigMutateParams;

export type ConfigMutateResult = {
  ok: true;
  path: string;
  config: OpenClawConfig;
  restart: unknown;
  sentinel?: { path: string; payload: unknown };
};

// ── OpenClaw config shape (practical subset for multi-agent module) ───────────

export type AgentToolsConfig = {
  allow?: string[];
  deny?: string[];
};

export type AgentModelConfig = {
  primary: string;
  fallbacks?: string[];
};

export type AgentEntry = {
  id: string;
  default?: boolean;
  workspace: string;
  agentDir?: string;
  model?: AgentModelConfig;
  tools?: AgentToolsConfig;
};

export type BindingMatchConfig = {
  channel?: string;
  accountId?: string;
  guildId?: string;
  channelId?: string;
  peer?: {
    kind?: "direct" | "group";
    id?: string;
  };
};

export type BindingEntry = {
  agentId: string;
  match: BindingMatchConfig;
};

export type SessionConfig = {
  dmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
  identityLinks?: Record<string, string[]>;
};

export type OpenClawConfig = {
  agents?: {
    list?: AgentEntry[];
    defaults?: Record<string, unknown>;
  };
  bindings?: BindingEntry[];
  session?: SessionConfig;
  channels?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  [key: string]: unknown;
};
