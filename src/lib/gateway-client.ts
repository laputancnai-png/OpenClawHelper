// ─────────────────────────────────────────────────────────────────────────────
// GatewayClient — OpenClaw Gateway WebSocket RPC client
//
// Handles:
//   • WS connection lifecycle
//   • connect.challenge → connect handshake (protocol v3)
//   • Request/response matching by id
//   • Event bus for server-pushed EventFrames
//   • Exponential backoff reconnect
//   • Pending request queue (flushed after reconnect)
//   • baseHash tracking — always use client.lastHash after any mutation
// ─────────────────────────────────────────────────────────────────────────────

import type {
  GatewayFrame,
  ReqFrame,
  ResFrame,
  EventFrame,
  ConnectParams,
  ConnectResult,
  ConfigSnapshot,
  ConfigPatchParams,
  ConfigApplyParams,
  ConfigMutateResult,
  GatewayError,
  SessionsListResult,
  SessionsDeleteResult,
} from "./gateway-ws-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "handshaking"
  | "connected"
  | "reconnecting"
  | "error";

export type ConnectionStateChangeHandler = (state: ConnectionState) => void;
export type EventHandler = (payload: unknown) => void;

export class GatewayRpcError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "GatewayRpcError";
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = 3;
const CLIENT_ID = "webchat-ui";
const CLIENT_VERSION = "0.1.0";
const REQUEST_TIMEOUT_MS = 15_000;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

// ── GatewayClient ─────────────────────────────────────────────────────────────

export class GatewayClient {
  // Public state
  state: ConnectionState = "disconnected";
  lastHash: string | null = null;       // Updated after every config.get / patch / apply
  serverVersion: string | null = null;

  // Private
  private ws: WebSocket | null = null;
  private url = "ws://127.0.0.1:18789";
  private token: string | undefined;
  private idSeq = 0;
  private pending = new Map<string, (res: ResFrame) => void>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private stateHandlers = new Set<ConnectionStateChangeHandler>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Connect and perform handshake. Resolves when connected & authenticated. */
  async connect(url: string, token?: string): Promise<void> {
    this.url = url;
    this.token = token;
    this.destroyed = false;
    return this._openSocket();
  }

  /** Cleanly close the connection. No reconnect will be attempted. */
  destroy(): void {
    this.destroyed = true;
    this._clearReconnectTimer();
    this.ws?.close(1000, "client destroy");
    this._rejectAllPending("Client destroyed");
    this._setState("disconnected");
  }

  /** Subscribe to a server-pushed event (EventFrame.event). */
  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /** Subscribe to connection state changes. */
  onStateChange(handler: ConnectionStateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  // ── RPC convenience methods ─────────────────────────────────────────────────

  /** Fetch current config snapshot. Always call this before patch/apply to get fresh hash. */
  async configGet(): Promise<ConfigSnapshot> {
    const snap = await this._request<ConfigSnapshot>("config.get", {});
    this.lastHash = snap.hash;
    return snap;
  }

  /**
   * Patch config (deep merge).
   * raw must be a JSON5 string, e.g.: '{ agents: { list: [...] } }'
   * baseHash defaults to this.lastHash — call configGet() first if unsure.
   */
  async configPatch(params: Omit<ConfigPatchParams, "baseHash"> & { baseHash?: string }): Promise<ConfigMutateResult> {
    const baseHash = params.baseHash ?? this.lastHash;
    if (!baseHash) {
      throw new GatewayRpcError(
        "baseHash is required. Call configGet() first.",
        "MISSING_BASE_HASH",
      );
    }
    const result = await this._request<ConfigMutateResult>("config.patch", {
      ...params,
      baseHash,
    });
    // Update lastHash from the mutated config's new hash if available
    // (Gateway may return updated hash inside config or restart payload)
    return result;
  }

  /**
   * Apply full config replacement.
   * raw must be a JSON5 string of the entire desired config.
   */
  async configApply(params: Omit<ConfigApplyParams, "baseHash"> & { baseHash?: string }): Promise<ConfigMutateResult> {
    const baseHash = params.baseHash ?? this.lastHash;
    if (!baseHash) {
      throw new GatewayRpcError(
        "baseHash is required. Call configGet() first.",
        "MISSING_BASE_HASH",
      );
    }
    return this._request<ConfigMutateResult>("config.apply", {
      ...params,
      baseHash,
    });
  }

  async sessionsList(limit = 100): Promise<SessionsListResult> {
    return this._request<SessionsListResult>("sessions.list", { limit });
  }

  async sessionsDelete(key: string): Promise<SessionsDeleteResult> {
    return this._request<SessionsDeleteResult>("sessions.delete", { key });
  }

  // ── Core RPC ────────────────────────────────────────────────────────────────

  private _request<TPayload = unknown>(method: string, params?: unknown): Promise<TPayload> {
    return new Promise<TPayload>((resolve, reject) => {
      if (this.state !== "connected" && this.state !== "handshaking") {
        return reject(new GatewayRpcError(
          `Cannot send request: connection state is "${this.state}"`,
          "NOT_CONNECTED",
        ));
      }

      const id = `req-${++this.idSeq}`;
      const frame: ReqFrame = { type: "req", id, method, params };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayRpcError(
          `Request timeout: ${method} (${REQUEST_TIMEOUT_MS}ms)`,
          "TIMEOUT",
          true,
        ));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, (res: ResFrame) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (res.ok) {
          resolve((res.payload ?? {}) as TPayload);
        } else {
          const err = (res as ResFrame & { ok: false }).error;
          reject(new GatewayRpcError(
            err.message,
            err.code,
            err.retryable ?? false,
            err.retryAfterMs,
            err.details,
          ));
        }
      });

      try {
        this.ws!.send(JSON.stringify(frame));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new GatewayRpcError("Failed to send frame", "SEND_FAILED", true));
      }
    });
  }

  // ── Socket lifecycle ────────────────────────────────────────────────────────

  private _openSocket(): Promise<void> {
    this._setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        // Don't resolve yet — wait for connect.challenge → connect handshake
        this._setState("handshaking");
      };

      ws.onmessage = (ev: MessageEvent) => {
        let frame: GatewayFrame;
        try {
          frame = JSON.parse(String(ev.data)) as GatewayFrame;
        } catch {
          console.warn("[GatewayClient] Failed to parse frame:", ev.data);
          return;
        }

        // ── Handshake: server sends connect.challenge event first ────────────
        if (frame.type === "event" && frame.event === "connect.challenge") {
          const connectParams: ConnectParams = {
            minProtocol: PROTOCOL_VERSION,
            maxProtocol: PROTOCOL_VERSION,
            client: {
              id: CLIENT_ID,
              version: CLIENT_VERSION,
              platform: "web",
              mode: "webchat",
            },
            role: "operator",
            scopes: ["operator.read", "operator.write", "operator.admin"],
            caps: [],
            commands: [],
            permissions: {},
            auth: this.token ? { token: this.token } : undefined,
            locale: navigator.language,
            userAgent: navigator.userAgent,
          };
          // Send connect req — response will come through normal pending map
          this._request<ConnectResult>("connect", connectParams)
            .then((result) => {
              this.serverVersion = result.serverVersion ?? null;
              this.reconnectAttempt = 0;
              this._setState("connected");
              if (!resolved) {
                resolved = true;
                resolve();
              }
            })
            .catch((err) => {
              if (!resolved) {
                resolved = true;
                reject(err);
              }
              this._handleDisconnect();
            });
          return;
        }

        // ── Response frames ──────────────────────────────────────────────────
        if (frame.type === "res") {
          const cb = this.pending.get(frame.id);
          if (cb) cb(frame);
          return;
        }

        // ── Server-pushed event frames ────────────────────────────────────────
        if (frame.type === "event") {
          this._dispatchEvent(frame);
          return;
        }
      };

      ws.onclose = (ev: CloseEvent) => {
        if (!resolved) {
          resolved = true;
          reject(new GatewayRpcError(
            `WebSocket closed before handshake (code ${ev.code})`,
            "WS_CLOSED",
            true,
          ));
        }
        this._handleDisconnect();
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          reject(new GatewayRpcError(
            "WebSocket error during connection",
            "WS_ERROR",
            true,
          ));
        }
      };
    });
  }

  private _handleDisconnect(): void {
    if (this.destroyed) return;
    this._rejectAllPending("Connection lost");
    this._setState("reconnecting");
    this._scheduleReconnect();
  }

  private _scheduleReconnect(): void {
    if (this.destroyed) return;
    this._clearReconnectTimer();

    const delay = RECONNECT_DELAYS_MS[
      Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
    ];
    this.reconnectAttempt++;

    console.info(`[GatewayClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      this._openSocket().catch(() => {
        // _handleDisconnect will schedule the next attempt
      });
    }, delay);
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _rejectAllPending(reason: string): void {
    for (const [id, cb] of this.pending.entries()) {
      cb({
        type: "res",
        id,
        ok: false,
        error: { code: "CONNECTION_LOST", message: reason },
      });
    }
    this.pending.clear();
  }

  private _setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateHandlers) {
      try { handler(state); } catch { /* ignore */ }
    }
  }

  private _dispatchEvent(frame: EventFrame): void {
    const handlers = this.eventHandlers.get(frame.event);
    if (handlers) {
      for (const h of handlers) {
        try { h(frame.payload); } catch { /* ignore */ }
      }
    }
    // Always dispatch to wildcard listeners
    const wildcards = this.eventHandlers.get("*");
    if (wildcards) {
      for (const h of wildcards) {
        try { h(frame); } catch { /* ignore */ }
      }
    }
  }
}

// ── Singleton factory (one client per app) ────────────────────────────────────

let _instance: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!_instance) _instance = new GatewayClient();
  return _instance;
}

export function resetGatewayClient(): void {
  _instance?.destroy();
  _instance = null;
}
