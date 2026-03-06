// ─────────────────────────────────────────────────────────────────────────────
// config-serialiser.ts
//
// Converts UI state (AgentEntry[], BindingEntry[], SessionConfig) into
// JSON5 strings suitable for config.patch / config.apply raw params.
//
// Key points:
//   • config.patch raw is JSON5 (unquoted keys, trailing commas OK)
//   • Gateway deep-merges patch into existing config
//   • config.apply raw replaces entire config
//   • We only ever patch the fields we own (agents, bindings, session)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AgentEntry,
  BindingEntry,
  SessionConfig,
} from "./gateway-ws-types";

// ── UI-layer types (richer than the wire types) ───────────────────────────────

export type UIAgent = AgentEntry & {
  soulContent?: string;   // In-memory; written to SOUL.md via a separate mechanism
  status?: "running" | "idle" | "error";
};

export type UIBinding = BindingEntry & {
  id: string;             // UI-only stable key for React reconciliation
  label?: string;         // UI-only display name
};

export type UISessionConfig = SessionConfig;

export type MultiAgentDraft = {
  agents: UIAgent[];
  bindings: UIBinding[];
  session: UISessionConfig;
};

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Produce a JSON5 patch string for config.patch.
 * Only includes agents.list, bindings, session — other config fields untouched.
 */
export function serialisePatch(draft: MultiAgentDraft): string {
  const patch = {
    agents: {
      list: draft.agents.map(stripUIFields),
    },
    bindings: draft.bindings.map(stripBindingUIFields),
    session: draft.session,
  };
  return toJSON5(patch);
}

/**
 * Serialise a single agent's SOUL.md content for a targeted patch.
 * NOTE: OpenClaw writes file contents via a special field in the config patch.
 * Structure TBC — this is a placeholder using the most likely convention.
 * Update once confirmed from protocol docs.
 */
export function serialiseSoulPatch(agentId: string, soulContent: string): string {
  return toJSON5({
    agents: {
      list: [
        {
          id: agentId,
          _files: {
            "SOUL.md": soulContent,
          },
        },
      ],
    },
  });
}

// ── Diff / change detection ───────────────────────────────────────────────────

/**
 * Returns true if the draft differs from the current snapshot's config.
 * Used to enable/disable the "Preview & Apply" button.
 */
export function hasPendingChanges(
  draft: MultiAgentDraft,
  snapshot: { agents?: { list?: AgentEntry[] }; bindings?: BindingEntry[]; session?: SessionConfig } | null,
): boolean {
  if (!snapshot) return true;
  return serialisePatch(draft) !== toJSON5({
    agents: { list: (snapshot.agents?.list ?? []) },
    bindings: snapshot.bindings ?? [],
    session: snapshot.session ?? {},
  });
}

/**
 * Build a UIAgent[] from a config snapshot for initial UI state.
 */
export function agentsFromSnapshot(config: {
  agents?: { list?: AgentEntry[] };
}): UIAgent[] {
  return (config.agents?.list ?? []).map(a => ({ ...a }));
}

/**
 * Build UIBinding[] from a config snapshot.
 * Assigns stable UI ids.
 */
export function bindingsFromSnapshot(config: {
  bindings?: BindingEntry[];
}): UIBinding[] {
  return (config.bindings ?? []).map((b, i) => ({
    ...b,
    id: `binding-${i}-${b.agentId}`,
  }));
}

// ── Validation ────────────────────────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
};

export function validateDraft(draft: MultiAgentDraft): ValidationResult {
  const errors: { field: string; message: string }[] = [];
  const warnings: { field: string; message: string }[] = [];

  // Must have at least one agent
  if (draft.agents.length === 0) {
    errors.push({ field: "agents", message: "At least one agent is required." });
  }

  // Exactly one default agent
  const defaults = draft.agents.filter(a => a.default);
  if (defaults.length === 0) {
    warnings.push({ field: "agents", message: "No default agent set. Unmatched messages will be dropped." });
  }
  if (defaults.length > 1) {
    errors.push({ field: "agents", message: `Multiple agents marked as default: ${defaults.map(a => a.id).join(", ")}` });
  }

  // Unique agent IDs
  const agentIds = draft.agents.map(a => a.id);
  const dupeIds = agentIds.filter((id, i) => agentIds.indexOf(id) !== i);
  if (dupeIds.length > 0) {
    errors.push({ field: "agents.id", message: `Duplicate agent IDs: ${[...new Set(dupeIds)].join(", ")}` });
  }

  // Unique agentDirs (if set)
  const dirs = draft.agents.map(a => a.agentDir).filter(Boolean);
  const dupeDirs = dirs.filter((d, i) => dirs.indexOf(d) !== i);
  if (dupeDirs.length > 0) {
    errors.push({ field: "agents.agentDir", message: `Shared agentDir will cause session collision: ${[...new Set(dupeDirs)].join(", ")}` });
  }

  // All binding agentIds must reference existing agents
  for (const binding of draft.bindings) {
    if (!agentIds.includes(binding.agentId)) {
      errors.push({ field: `bindings`, message: `Binding references unknown agentId "${binding.agentId}"` });
    }
  }

  // Session safety warning
  if (draft.session.dmScope === "main" && draft.agents.length > 1) {
    warnings.push({
      field: "session.dmScope",
      message: 'dmScope "main" shares context across all users. Switch to "per-channel-peer" for multi-user safety.',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function stripUIFields(agent: UIAgent): AgentEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { soulContent, status, ...wireAgent } = agent;
  return wireAgent;
}

function stripBindingUIFields(binding: UIBinding): BindingEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, label, ...wireBinding } = binding;
  return wireBinding;
}

/**
 * Minimal JSON5 serialiser.
 * Uses unquoted keys where safe, standard JSON otherwise.
 * JSON5 is a superset of JSON so plain JSON.stringify output is always valid JSON5.
 */
function toJSON5(obj: unknown): string {
  // For now, output strict JSON (always valid JSON5).
  // A future iteration can use the `json5` npm package for prettier output.
  return JSON.stringify(obj, null, 2);
}
