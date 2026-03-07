import type {
  ConfigSnapshot,
  ConfigPatchParams,
  ConfigApplyParams,
  ConfigMutateResult,
  SessionsListResult,
  SessionsDeleteResult,
  CronListResult,
  CronRemoveResult,
} from "./gateway-ws-types";

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
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "GatewayRpcError";
  }
}

const RPC_URL = "http://127.0.0.1:3131/api/gateway-rpc";

export class GatewayClient {
  state: ConnectionState = "connected";
  lastHash: string | null = null;
  serverVersion: string | null = null;
  private stateHandlers = new Set<ConnectionStateChangeHandler>();

  async connect(_url: string, _token?: string): Promise<void> {
    this._setState("connected");
  }

  destroy(): void {
    this._setState("disconnected");
  }

  on(_event: string, _handler: EventHandler): () => void {
    return () => {};
  }
  off(_event: string, _handler: EventHandler): void {}

  onStateChange(handler: ConnectionStateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  async configGet(): Promise<ConfigSnapshot> {
    const snap = await this._request<ConfigSnapshot>("config.get", {});
    this.lastHash = snap.hash;
    return snap;
  }

  async configPatch(params: Omit<ConfigPatchParams, "baseHash"> & { baseHash?: string }): Promise<ConfigMutateResult> {
    const baseHash = params.baseHash ?? this.lastHash;
    if (!baseHash) throw new GatewayRpcError("baseHash is required. Call configGet() first.", "MISSING_BASE_HASH");
    return this._request<ConfigMutateResult>("config.patch", { ...params, baseHash });
  }

  async configApply(params: Omit<ConfigApplyParams, "baseHash"> & { baseHash?: string }): Promise<ConfigMutateResult> {
    const baseHash = params.baseHash ?? this.lastHash;
    if (!baseHash) throw new GatewayRpcError("baseHash is required. Call configGet() first.", "MISSING_BASE_HASH");
    return this._request<ConfigMutateResult>("config.apply", { ...params, baseHash });
  }

  async sessionsList(limit = 100): Promise<SessionsListResult> {
    return this._request<SessionsListResult>("sessions.list", { limit });
  }

  async sessionsDelete(key: string): Promise<SessionsDeleteResult> {
    return this._request<SessionsDeleteResult>("sessions.delete", { key });
  }

  async cronList(): Promise<CronListResult> {
    return this._request<CronListResult>("cron.list", {});
  }

  async cronRemove(id: string): Promise<CronRemoveResult> {
    return this._request<CronRemoveResult>("cron.rm", { id });
  }

  private async _request<TPayload = unknown>(method: string, params?: unknown): Promise<TPayload> {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      const err = json?.error || { code: "RPC_ERROR", message: `Request failed: ${method}` };
      throw new GatewayRpcError(err.message || "RPC error", err.code || "RPC_ERROR");
    }
    return (json.payload ?? {}) as TPayload;
  }

  private _setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const h of this.stateHandlers) {
      try { h(state); } catch {}
    }
  }
}

let _instance: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!_instance) _instance = new GatewayClient();
  return _instance;
}

export function resetGatewayClient(): void {
  _instance?.destroy();
  _instance = null;
}
