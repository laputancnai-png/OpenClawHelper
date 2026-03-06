// ─────────────────────────────────────────────────────────────────────────────
// hooks/useFileServer.ts
//
// React hooks for the local Node.js file server (port 3131).
// Handles SOUL.md read/write for all agents.
//
// Usage:
//   const { readFile, writeFile, workspace } = useFileServer();
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";

// In dev, Vite proxies /api → http://127.0.0.1:3131 (see vite.config.js)
// In production build, server.mjs serves the built files on the same origin.
const FILE_SERVER = "";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FileServerStatus = "unknown" | "online" | "offline";

export type WorkspaceInfo = {
  workspace: string;
  rootFiles: Record<string, { exists: boolean; size?: number; mtime?: string }>;
  agents: Array<{ id: string; hasSoul: boolean; soulRelPath: string }>;
};

export type FileContent = {
  path: string;
  content: string;
  size: number;
  mtime: string;
};

// ── Soul path helpers ─────────────────────────────────────────────────────────

/**
 * Returns the relative path for an agent's SOUL.md.
 * OpenClaw multi-agent layout convention:
 *   ~/.openclaw/workspace-<id>/SOUL.md
 */
export function agentFilePath(agentId: string, filename: string): string {
  return `workspace-${agentId}/${filename}`;
}

export function soulPath(agentId: string): string {
  return agentFilePath(agentId, "SOUL.md");
}

// ── Core fetch helpers ────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── useFileServer ─────────────────────────────────────────────────────────────

export type UseFileServerReturn = {
  status: FileServerStatus;
  workspace: WorkspaceInfo | null;
  reloadWorkspace: () => Promise<void>;

  // Read a workspace file (e.g. workspace-main/SOUL.md, workspace-writer/SOUL.md)
  readFile: (relPath: string) => Promise<FileContent>;

  // Write a workspace file — creates dirs if needed
  writeFile: (relPath: string, content: string) => Promise<void>;

  // Convenience: read SOUL.md for a given agentId
  readSoul: (agentId: string) => Promise<string>;

  // Convenience: write SOUL.md for a given agentId
  writeSoul: (agentId: string, content: string) => Promise<void>;

  // Delete agent filesystem directories (workspace-<id> + agents/<id>)
  deleteAgentFiles: (agentId: string) => Promise<void>;
};

export function useFileServer(): UseFileServerReturn {
  const [status, setStatus] = useState<FileServerStatus>("unknown");
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  // Health check on mount
  useEffect(() => {
    fetchJSON<{ ok: boolean }>(`${FILE_SERVER}/api/health`)
      .then(() => setStatus("online"))
      .catch(() => setStatus("offline"));
  }, []);

  const reloadWorkspace = useCallback(async () => {
    try {
      const info = await fetchJSON<WorkspaceInfo>(`${FILE_SERVER}/api/workspace`);
      setWorkspace(info);
      setStatus("online");
    } catch {
      setStatus("offline");
    }
  }, []);

  // Auto-load workspace once server is online
  useEffect(() => {
    if (status === "online") void reloadWorkspace();
  }, [status, reloadWorkspace]);

  const readFile = useCallback(async (relPath: string): Promise<FileContent> => {
    return fetchJSON<FileContent>(
      `${FILE_SERVER}/api/file?path=${encodeURIComponent(relPath)}`
    );
  }, []);

  const writeFile = useCallback(async (relPath: string, content: string): Promise<void> => {
    await fetchJSON(
      `${FILE_SERVER}/api/file?path=${encodeURIComponent(relPath)}`,
      { method: "PUT", body: content, headers: { "Content-Type": "text/plain" } }
    );
  }, []);

  const readSoul = useCallback(async (agentId: string): Promise<string> => {
    try {
      const file = await readFile(soulPath(agentId));
      return file.content;
    } catch (e: unknown) {
      // 404 = no SOUL.md yet, return empty string — UI will show template
      if (e instanceof Error && e.message.includes("404")) return "";
      throw e;
    }
  }, [readFile]);

  const writeSoul = useCallback(async (agentId: string, content: string): Promise<void> => {
    await writeFile(soulPath(agentId), content);
  }, [writeFile]);

  const deleteAgentFiles = useCallback(async (agentId: string): Promise<void> => {
    await fetchJSON(
      `${FILE_SERVER}/api/agent?id=${encodeURIComponent(agentId)}`,
      { method: "DELETE" }
    );
  }, []);

  return { status, workspace, reloadWorkspace, readFile, writeFile, readSoul, writeSoul, deleteAgentFiles };
}
