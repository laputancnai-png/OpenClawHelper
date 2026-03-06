// ─────────────────────────────────────────────────────────────────────────────
// hooks/useGateway.ts
//
// React hooks for OpenClaw Gateway WebSocket integration.
//
// Usage:
//   const { state, client, connect } = useGateway();
//   const { snapshot, reload } = useConfigSnapshot();
//   const { draft, updateAgent, applyDraft } = useMultiAgentDraft();
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { getGatewayClient, GatewayRpcError, type ConnectionState } from "../lib/gateway-client";
import type { ConfigSnapshot } from "../lib/gateway-ws-types";
import {
  type UIAgent,
  type UIBinding,
  type UISessionConfig,
  type MultiAgentDraft,
  type ValidationResult,
  agentsFromSnapshot,
  bindingsFromSnapshot,
  serialisePatch,
  validateDraft,
  hasPendingChanges,
} from "../lib/config-serialiser";

// ── useGateway ─────────────────────────────────────────────────────────────────
// Low-level hook: manages connection state & exposes client instance.

export type UseGatewayReturn = {
  state: ConnectionState;
  serverVersion: string | null;
  lastError: string | null;
  connect: (url: string, token?: string) => Promise<void>;
  disconnect: () => void;
};

export function useGateway(): UseGatewayReturn {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const client = getGatewayClient();
    setState(client.state);
    setServerVersion(client.serverVersion);

    const unsub = client.onStateChange((s) => {
      setState(s);
      setServerVersion(client.serverVersion);
      if (s === "error" || s === "disconnected") {
        // lastError stays set until next successful connect
      }
    });
    return unsub;
  }, []);

  const connect = useCallback(async (url: string, token?: string) => {
    setLastError(null);
    try {
      await getGatewayClient().connect(url, token);
    } catch (e) {
      const msg = e instanceof GatewayRpcError ? e.message : String(e);
      setLastError(msg);
      throw e;
    }
  }, []);

  const disconnect = useCallback(() => {
    getGatewayClient().destroy();
  }, []);

  return { state, serverVersion, lastError, connect, disconnect };
}

// ── useConfigSnapshot ─────────────────────────────────────────────────────────
// Fetches config.get on mount (and on demand), tracks loading/error state.

export type UseConfigSnapshotReturn = {
  snapshot: ConfigSnapshot | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useConfigSnapshot(): UseConfigSnapshotReturn {
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state } = useGateway();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getGatewayClient().configGet();
      setSnapshot(snap);
    } catch (e) {
      setError(e instanceof GatewayRpcError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load when connection becomes ready
  useEffect(() => {
    if (state === "connected") {
      void reload();
    }
  }, [state, reload]);

  // Re-sync when Gateway pushes a config-changed event
  useEffect(() => {
    const client = getGatewayClient();
    const unsub = client.on("config.changed", () => {
      void reload();
    });
    return unsub;
  }, [reload]);

  return { snapshot, loading, error, reload };
}

// ── useMultiAgentDraft ─────────────────────────────────────────────────────────
// Full multi-agent editing workflow: draft state, validation, apply.

export type ApplyStatus = "idle" | "patching" | "success" | "error";

export type UseMultiAgentDraftReturn = {
  draft: MultiAgentDraft;
  isDirty: boolean;
  validation: ValidationResult;

  // Agent operations
  updateAgent: (agent: UIAgent) => void;
  addAgent: (agent: UIAgent) => void;
  removeAgent: (agentId: string) => void;
  setDefaultAgent: (agentId: string) => void;

  // Binding operations
  updateBindings: (bindings: UIBinding[]) => void;
  addBinding: (binding: UIBinding) => void;
  removeBinding: (bindingId: string) => void;
  reorderBinding: (fromIndex: number, toIndex: number) => void;

  // Session
  updateSession: (session: UISessionConfig) => void;

  // Apply
  applyStatus: ApplyStatus;
  applyError: string | null;
  applyDraft: (note?: string) => Promise<void>;
  resetDraft: () => void;

  // Preview
  previewJSON: string;
};

export function useMultiAgentDraft(): UseMultiAgentDraftReturn {
  const { snapshot } = useConfigSnapshot();
  const snapshotRef = useRef<ConfigSnapshot | null>(null);

  const emptyDraft: MultiAgentDraft = {
    agents: [],
    bindings: [],
    session: { dmScope: "per-channel-peer" },
  };

  const [draft, setDraft] = useState<MultiAgentDraft>(emptyDraft);
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>("idle");
  const [applyError, setApplyError] = useState<string | null>(null);

  // Hydrate draft from snapshot (only on first load, not on every poll)
  useEffect(() => {
    if (!snapshot) return;
    // Only reset draft if we don't have one yet (first load)
    if (snapshotRef.current === null) {
      setDraft({
        agents: agentsFromSnapshot(snapshot.config),
        bindings: bindingsFromSnapshot(snapshot.config),
        session: (snapshot.config.session as UISessionConfig) ?? { dmScope: "per-channel-peer" },
      });
    }
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const validation = validateDraft(draft);
  const isDirty = hasPendingChanges(draft, snapshotRef.current?.config ?? null);
  const previewJSON = serialisePatch(draft);

  // ── Agent ops ──────────────────────────────────────────────────────────────

  const updateAgent = useCallback((updated: UIAgent) => {
    setDraft(d => ({
      ...d,
      agents: d.agents.map(a => a.id === updated.id ? updated : a),
    }));
  }, []);

  const addAgent = useCallback((agent: UIAgent) => {
    setDraft(d => ({ ...d, agents: [...d.agents, agent] }));
  }, []);

  const removeAgent = useCallback((agentId: string) => {
    setDraft(d => ({
      ...d,
      agents: d.agents.filter(a => a.id !== agentId),
      // Also remove bindings that reference this agent
      bindings: d.bindings.filter(b => b.agentId !== agentId),
    }));
  }, []);

  const setDefaultAgent = useCallback((agentId: string) => {
    setDraft(d => ({
      ...d,
      agents: d.agents.map(a => ({ ...a, default: a.id === agentId })),
    }));
  }, []);

  // ── Binding ops ────────────────────────────────────────────────────────────

  const updateBindings = useCallback((bindings: UIBinding[]) => {
    setDraft(d => ({ ...d, bindings }));
  }, []);

  const addBinding = useCallback((binding: UIBinding) => {
    setDraft(d => ({ ...d, bindings: [...d.bindings, binding] }));
  }, []);

  const removeBinding = useCallback((bindingId: string) => {
    setDraft(d => ({ ...d, bindings: d.bindings.filter(b => b.id !== bindingId) }));
  }, []);

  const reorderBinding = useCallback((fromIndex: number, toIndex: number) => {
    setDraft(d => {
      const next = [...d.bindings];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...d, bindings: next };
    });
  }, []);

  // ── Session ────────────────────────────────────────────────────────────────

  const updateSession = useCallback((session: UISessionConfig) => {
    setDraft(d => ({ ...d, session }));
  }, []);

  // ── Apply ──────────────────────────────────────────────────────────────────

  const applyDraft = useCallback(async (note = "Updated via OpenClaw Web UI") => {
    if (!validation.valid) {
      setApplyError("Cannot apply: draft has validation errors.");
      return;
    }
    setApplyStatus("patching");
    setApplyError(null);

    const client = getGatewayClient();

    // Always refresh hash immediately before patching to avoid HASH_MISMATCH
    let latestHash: string;
    try {
      const fresh = await client.configGet();
      snapshotRef.current = fresh;
      latestHash = fresh.hash;
    } catch (e) {
      setApplyStatus("error");
      setApplyError(`Failed to fetch latest config: ${e instanceof GatewayRpcError ? e.message : String(e)}`);
      return;
    }

    const raw = serialisePatch(draft);

    try {
      await client.configPatch({
        raw,
        baseHash: latestHash,
        note,
        restartDelayMs: 2000,
      });
      setApplyStatus("success");
      // Refresh snapshot after successful apply
      setTimeout(() => {
        void client.configGet().then(snap => {
          snapshotRef.current = snap;
        });
        setApplyStatus("idle");
      }, 3000);
    } catch (e) {
      setApplyStatus("error");
      const msg = e instanceof GatewayRpcError ? `${e.code}: ${e.message}` : String(e);
      setApplyError(msg);
    }
  }, [draft, validation.valid]);

  const resetDraft = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    setDraft({
      agents: agentsFromSnapshot(snap.config),
      bindings: bindingsFromSnapshot(snap.config),
      session: (snap.config.session as UISessionConfig) ?? { dmScope: "per-channel-peer" },
    });
    setApplyStatus("idle");
    setApplyError(null);
  }, []);

  return {
    draft,
    isDirty,
    validation,
    updateAgent,
    addAgent,
    removeAgent,
    setDefaultAgent,
    updateBindings,
    addBinding,
    removeBinding,
    reorderBinding,
    updateSession,
    applyStatus,
    applyError,
    applyDraft,
    resetDraft,
    previewJSON,
  };
}
