import { useState } from "react";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INITIAL_AGENTS = [
  {
    id: "main",
    default: true,
    workspace: "~/.openclaw/agents/main",
    model: "claude-opus-4",
    soul: "You are a helpful general-purpose assistant. You coordinate with specialist agents when needed.",
    tools: { allow: ["web", "memory"], deny: [] },
    status: "running",
  },
  {
    id: "code-reviewer",
    default: false,
    workspace: "~/.openclaw/agents/code-reviewer",
    model: "claude-sonnet-4",
    soul: "You are a senior software engineer specialising in code review. Be concise and precise.",
    tools: { allow: ["exec", "filesystem"], deny: ["web"] },
    status: "idle",
  },
];

const INITIAL_BINDINGS = [
  { id: "b1", agentId: "code-reviewer", channel: "discord", matchType: "guildChannel", guildId: "1234567890", channelId: "code-review" },
  { id: "b2", agentId: "main", channel: "*", matchType: "fallback" },
];

const MODELS = ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4", "gpt-4o", "gemini-2.0-flash"];
const CHANNELS = ["discord", "telegram", "whatsapp", "slack", "*"];
const ALL_TOOLS = [
  { id: "exec", label: "exec", risk: "high", desc: "Shell command execution" },
  { id: "filesystem", label: "filesystem", risk: "high", desc: "Read/write local files" },
  { id: "web", label: "web", risk: "medium", desc: "Web search & fetch" },
  { id: "memory", label: "memory", risk: "low", desc: "Persistent memory store" },
  { id: "mcp", label: "mcp", risk: "medium", desc: "MCP tool servers" },
];
const DM_SCOPES = [
  { value: "main", label: "main", desc: "单一共享 session（⚠️ 多用户不安全）", warn: true },
  { value: "per-peer", label: "per-peer", desc: "每个联系人独立 session" },
  { value: "per-channel-peer", label: "per-channel-peer", desc: "每个频道+联系人独立（推荐）" },
  { value: "per-account-channel-peer", label: "per-account-channel-peer", desc: "最高隔离级别" },
];

// ─── Colours & tokens ─────────────────────────────────────────────────────────
const C = {
  bg: "#07080a",
  surface: "#0e0f13",
  border: "#1a1d24",
  borderHover: "#2a2d38",
  text: "#e2e5ed",
  muted: "#4a5068",
  accent: "#3b82f6",
  accentDim: "#1d3a6b",
  green: "#22c55e",
  greenDim: "#14532d",
  yellow: "#eab308",
  yellowDim: "#3d3200",
  red: "#ef4444",
  redDim: "#450a0a",
};

const pill = (color, bg, text) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.5px",
  background: bg,
  color: color,
  border: `1px solid ${color}33`,
  fontFamily: "monospace",
  whiteSpace: "nowrap",
});

const StatusDot = ({ status }) => (
  <span style={{
    display: "inline-block", width: 7, height: 7, borderRadius: "50%",
    background: status === "running" ? C.green : C.muted,
    boxShadow: status === "running" ? `0 0 6px ${C.green}` : "none",
    marginRight: 6, flexShrink: 0,
  }} />
);

const WSBar = ({ connected }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 14px",
    background: connected ? "#071a0e" : "#1a0707",
    border: `1px solid ${connected ? "#14532d" : "#450a0a"}`,
    borderRadius: 6, fontSize: 11, fontFamily: "monospace",
    color: connected ? C.green : C.red,
  }}>
    <span style={{ fontSize: 8 }}>{connected ? "●" : "●"}</span>
    {connected ? "ws://localhost:18789  ·  connected" : "Gateway disconnected — retrying…"}
  </div>
);

const Btn = ({ onClick, children, variant = "default", small, style: s }) => {
  const base = {
    cursor: "pointer", border: "none", fontFamily: "monospace",
    fontSize: small ? 11 : 12, letterSpacing: "0.5px",
    padding: small ? "5px 12px" : "8px 18px", borderRadius: 5,
    transition: "all 0.15s", ...s,
  };
  const variants = {
    default: { background: C.accentDim, color: C.accent, border: `1px solid ${C.accent}44` },
    primary: { background: C.accent, color: "#fff" },
    danger: { background: C.redDim, color: C.red, border: `1px solid ${C.red}44` },
    ghost: { background: "none", color: C.muted, border: `1px solid ${C.border}` },
  };
  return <button onClick={onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
};

// ─── Views ────────────────────────────────────────────────────────────────────

function AgentList({ agents, onSelect, onAdd }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>Agents</div>
          <div style={{ fontSize: 12, color: C.muted }}>{agents.length} agents configured</div>
        </div>
        <Btn onClick={onAdd} variant="primary">+ New Agent</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {agents.map(a => (
          <div key={a.id} onClick={() => onSelect(a.id)}
            style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "16px 20px", cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHover}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusDot status={a.status} />
                <span style={{ fontFamily: "monospace", fontSize: 14, color: C.text, fontWeight: 600 }}>{a.id}</span>
                {a.default && <span style={pill(C.accent, C.accentDim, "")}>DEFAULT</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{a.model}</span>
                <span style={{ color: C.muted, fontSize: 14 }}>›</span>
              </div>
            </div>
            <div style={{ marginTop: 10, marginLeft: 13, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{a.workspace}</span>
            </div>
            <div style={{ marginTop: 10, marginLeft: 13, display: "flex", gap: 6 }}>
              {a.tools.allow.map(t => {
                const tool = ALL_TOOLS.find(x => x.id === t);
                const color = tool?.risk === "high" ? C.red : tool?.risk === "medium" ? C.yellow : C.green;
                const bg = tool?.risk === "high" ? C.redDim : tool?.risk === "medium" ? C.yellowDim : C.greenDim;
                return <span key={t} style={pill(color, bg)}>{t}</span>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentDetail({ agent, onSave, onBack }) {
  const [draft, setDraft] = useState({ ...agent });
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const toggleTool = (toolId) => {
    const allow = draft.tools.allow.includes(toolId)
      ? draft.tools.allow.filter(t => t !== toolId)
      : [...draft.tools.allow, toolId];
    set("tools", { ...draft.tools, allow });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, padding: 0 }}>‹</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, fontFamily: "monospace" }}>{agent.id}</div>
          <div style={{ fontSize: 11, color: C.muted }}>Agent configuration</div>
        </div>
        {agent.default && <span style={pill(C.accent, C.accentDim)}>DEFAULT</span>}
        <StatusDot status={agent.status} />
        <span style={{ fontSize: 11, color: agent.status === "running" ? C.green : C.muted }}>{agent.status}</span>
      </div>

      {/* Basic info */}
      <Section title="基础信息">
        <Field label="Agent ID">
          <input value={draft.id} onChange={e => set("id", e.target.value)}
            style={inputStyle} disabled={agent.id === "main"} />
        </Field>
        <Field label="Workspace Path">
          <input value={draft.workspace} onChange={e => set("workspace", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Model">
          <select value={draft.model} onChange={e => set("model", e.target.value)} style={inputStyle}>
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Set as Default Agent">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={draft.default} onChange={e => set("default", e.target.checked)}
              style={{ accentColor: C.accent, width: 14, height: 14 }} />
            <span style={{ fontSize: 12, color: C.muted }}>Messages with no matching binding fall back to this agent</span>
          </label>
        </Field>
      </Section>

      {/* SOUL.md */}
      <Section title="SOUL.md — Agent 人格与指令">
        <textarea value={draft.soul} onChange={e => set("soul", e.target.value)}
          rows={5} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "'Georgia', serif", fontSize: 13 }} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>写入 {draft.workspace}/SOUL.md</div>
      </Section>

      {/* Tools */}
      <Section title="工具权限">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ALL_TOOLS.map(tool => {
            const allowed = draft.tools.allow.includes(tool.id);
            const riskColor = tool.risk === "high" ? C.red : tool.risk === "medium" ? C.yellow : C.green;
            const riskBg = tool.risk === "high" ? C.redDim : tool.risk === "medium" ? C.yellowDim : C.greenDim;
            return (
              <div key={tool.id} onClick={() => toggleTool(tool.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "10px 14px", borderRadius: 6, cursor: "pointer",
                  background: allowed ? "#0e1a0e" : C.surface,
                  border: `1px solid ${allowed ? C.green + "44" : C.border}`,
                  transition: "all 0.15s",
                }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4,
                  background: allowed ? C.green : "none",
                  border: `2px solid ${allowed ? C.green : C.muted}`,
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {allowed && <span style={{ fontSize: 10, color: "#000", fontWeight: 700 }}>✓</span>}
                </div>
                <span style={pill(riskColor, riskBg)}>{tool.id}</span>
                <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{tool.desc}</span>
                {tool.risk === "high" && <span style={{ fontSize: 10, color: C.red }}>⚠ elevated</span>}
              </div>
            );
          })}
        </div>
      </Section>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Btn variant="primary" onClick={() => onSave(draft)}>保存草稿</Btn>
        <Btn variant="ghost" onClick={onBack}>取消</Btn>
      </div>
    </div>
  );
}

function Bindings({ agents, bindings, onAdd, onDelete, onReorder }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>Binding 路由规则</div>
          <div style={{ fontSize: 12, color: C.muted }}>优先级从上到下匹配，命中第一条即路由到对应 agent</div>
        </div>
        <Btn onClick={onAdd} variant="primary">+ Add Binding</Btn>
      </div>

      <div style={{
        background: C.accentDim + "55", border: `1px solid ${C.accent}33`,
        borderRadius: 6, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#93c5fd",
      }}>
        💡 拖拽行可调整优先级（原型中暂用 ↑↓ 按钮模拟）
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bindings.map((b, i) => {
          const agent = agents.find(a => a.id === b.agentId);
          return (
            <div key={b.id} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "14px 18px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", width: 20, textAlign: "center" }}>{i + 1}</span>

              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {b.matchType === "fallback" ? (
                  <span style={pill(C.muted, C.surface)}>* fallback</span>
                ) : (
                  <>
                    <span style={pill(C.accent, C.accentDim)}>{b.channel}</span>
                    {b.guildId && <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>guild:{b.guildId}</span>}
                    {b.channelId && <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>#{b.channelId}</span>}
                  </>
                )}
                <span style={{ color: C.muted, fontSize: 14 }}>→</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StatusDot status={agent?.status || "idle"} />
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: C.text }}>{b.agentId}</span>
                  {agent?.default && <span style={pill(C.accent, C.accentDim)}>DEFAULT</span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => onReorder(i, -1)} disabled={i === 0}
                  style={{ background: "none", border: "none", color: i === 0 ? C.border : C.muted, cursor: i === 0 ? "default" : "pointer", fontSize: 14, padding: "2px 6px" }}>↑</button>
                <button onClick={() => onReorder(i, 1)} disabled={i === bindings.length - 1}
                  style={{ background: "none", border: "none", color: i === bindings.length - 1 ? C.border : C.muted, cursor: i === bindings.length - 1 ? "default" : "pointer", fontSize: 14, padding: "2px 6px" }}>↓</button>
                <button onClick={() => onDelete(b.id)}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionConfig({ dmScope, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>Session 隔离</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>控制不同用户、频道之间是否共享对话上下文</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {DM_SCOPES.map(s => {
          const active = dmScope === s.value;
          return (
            <div key={s.value} onClick={() => onChange(s.value)}
              style={{
                background: active ? "#0e1a0e" : C.surface,
                border: `1px solid ${active ? C.green + "66" : C.border}`,
                borderRadius: 8, padding: "16px 20px", cursor: "pointer",
                transition: "all 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: `2px solid ${active ? C.green : C.muted}`,
                  background: active ? C.green : "none",
                  flexShrink: 0,
                }} />
                <span style={{ fontFamily: "monospace", fontSize: 13, color: active ? C.text : C.muted, fontWeight: active ? 600 : 400 }}>{s.label}</span>
                {s.warn && <span style={pill(C.red, C.redDim)}>⚠ 多用户不安全</span>}
              </div>
              <div style={{ marginLeft: 28, marginTop: 6, fontSize: 12, color: C.muted }}>{s.desc}</div>
              {s.warn && active && (
                <div style={{
                  marginLeft: 28, marginTop: 10,
                  background: C.redDim, border: `1px solid ${C.red}44`,
                  borderRadius: 4, padding: "8px 12px", fontSize: 12, color: C.red,
                }}>
                  ⚠ 多个用户共享同一 session，上下文可能泄漏给其他人。若有多用户接入，请改用 per-channel-peer。
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Preview({ agents, bindings, dmScope, onApply }) {
  const config = {
    agents: {
      list: agents.map(a => ({
        id: a.id,
        ...(a.default ? { default: true } : {}),
        workspace: a.workspace,
        model: { primary: a.model },
        tools: a.tools,
      })),
    },
    bindings: bindings.map(b => ({
      agentId: b.agentId,
      match: b.matchType === "fallback"
        ? {}
        : { channel: b.channel, ...(b.guildId ? { guildId: b.guildId } : {}), ...(b.channelId ? { channelId: b.channelId } : {}) },
    })),
    session: { dmScope },
  };

  const [applied, setApplied] = useState(false);
  const handleApply = () => { setApplied(true); onApply(); };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>配置预览 & 应用</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
        以下为生成的 config.patch 参数。确认无误后点击「应用配置」。
      </div>

      <div style={{
        background: "#050607", border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "20px 24px", marginBottom: 20,
        fontFamily: "monospace", fontSize: 12, lineHeight: 1.7,
        color: "#a5b4d4", overflowX: "auto", maxHeight: 400, overflowY: "auto",
      }}>
        <pre style={{ margin: 0 }}>{JSON.stringify(config, null, 2)}</pre>
      </div>

      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "14px 18px", marginBottom: 20,
        fontSize: 12, color: C.muted,
      }}>
        <div style={{ marginBottom: 6, color: C.text, fontWeight: 600 }}>应用流程</div>
        {[
          ["1", "config.patch(delta)", "写入配置差量"],
          ["2", "config.apply()", "触发 Gateway reload"],
          ["3", "等待推送确认", "Gateway 广播 reload:complete 事件"],
        ].map(([n, cmd, desc]) => (
          <div key={n} style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ color: C.accent, fontFamily: "monospace", fontSize: 11, width: 8 }}>{n}</span>
            <span style={{ fontFamily: "monospace", color: "#93c5fd", width: 200 }}>{cmd}</span>
            <span style={{ color: C.muted }}>{desc}</span>
          </div>
        ))}
      </div>

      {applied ? (
        <div style={{
          background: C.greenDim, border: `1px solid ${C.green}44`,
          borderRadius: 8, padding: "16px 20px",
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 13, color: C.green,
        }}>
          <span style={{ fontSize: 18 }}>✓</span>
          配置已应用！Gateway reload 完成，agents 运行中。
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="primary" onClick={handleApply}>🚀 应用配置</Btn>
          <Btn variant="ghost">导出 JSON 文件</Btn>
        </div>
      )}
    </div>
  );
}

// ─── Shared layout components ─────────────────────────────────────────────────
const inputStyle = {
  background: "#080a0d", border: `1px solid ${C.border}`, borderRadius: 5,
  color: C.text, padding: "8px 12px", fontSize: 13, fontFamily: "monospace",
  width: "100%", boxSizing: "border-box", outline: "none",
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, letterSpacing: "2px", textTransform: "uppercase",
        color: C.accent, fontFamily: "monospace", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ display: "inline-block", width: 3, height: 3, background: C.accent, borderRadius: "50%" }} />
        {title}
      </div>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 6, letterSpacing: "0.5px" }}>{label}</div>
      {children}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV = [
  { id: "agents", label: "Agents", icon: "◈" },
  { id: "bindings", label: "Bindings", icon: "⇄" },
  { id: "session", label: "Session", icon: "⬡" },
  { id: "preview", label: "Preview", icon: "◷" },
];

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("agents");
  const [agents, setAgents] = useState(INITIAL_AGENTS);
  const [bindings, setBindings] = useState(INITIAL_BINDINGS);
  const [dmScope, setDmScope] = useState("per-channel-peer");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [wsConnected] = useState(true);

  const saveAgent = (draft) => {
    setAgents(ag => ag.map(a => a.id === draft.id ? { ...a, ...draft } : a));
    setSelectedAgent(null);
  };

  const addAgent = () => {
    const newAgent = {
      id: `agent-${agents.length + 1}`,
      default: false,
      workspace: `~/.openclaw/agents/agent-${agents.length + 1}`,
      model: "claude-sonnet-4",
      soul: "You are a helpful assistant.",
      tools: { allow: ["memory"], deny: [] },
      status: "idle",
    };
    setAgents(ag => [...ag, newAgent]);
    setSelectedAgent(newAgent.id);
  };

  const addBinding = () => {
    const nb = {
      id: `b${Date.now()}`,
      agentId: agents[0].id,
      channel: "telegram",
      matchType: "channel",
    };
    setBindings(bs => [nb, ...bs.filter(b => b.matchType !== "fallback"), ...bs.filter(b => b.matchType === "fallback")]);
  };

  const deleteBinding = (id) => setBindings(bs => bs.filter(b => b.id !== id));

  const reorderBinding = (i, dir) => {
    const nb = [...bindings];
    const j = i + dir;
    if (j < 0 || j >= nb.length) return;
    [nb[i], nb[j]] = [nb[j], nb[i]];
    setBindings(nb);
  };

  const agentDetail = selectedAgent ? agents.find(a => a.id === selectedAgent) : null;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "12px 24px", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
          <div style={{
            width: 28, height: 28, background: C.accent, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>C</div>
          <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>OpenClaw</span>
          <span style={{ fontSize: 12, color: C.muted }}>/ Multi-Agent</span>
        </div>

        <WSBar connected={wsConnected} />

        <div style={{ marginLeft: "auto", fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
          PROTOTYPE · v0.1
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar nav */}
        <div style={{
          width: 180, flexShrink: 0, background: C.surface,
          borderRight: `1px solid ${C.border}`, padding: "24px 0",
        }}>
          {NAV.map(n => {
            const active = view === n.id;
            return (
              <button key={n.id} onClick={() => { setView(n.id); setSelectedAgent(null); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: active ? C.bg : "none", border: "none",
                  borderLeft: `3px solid ${active ? C.accent : "transparent"}`,
                  padding: "12px 20px", cursor: "pointer", transition: "all 0.12s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, color: active ? C.accent : C.muted }}>{n.icon}</span>
                  <span style={{ fontSize: 13, color: active ? C.text : C.muted, fontWeight: active ? 600 : 400 }}>{n.label}</span>
                </div>
              </button>
            );
          })}

          {/* Agent quick list */}
          <div style={{ marginTop: 24, padding: "0 20px" }}>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, fontFamily: "monospace", marginBottom: 10 }}>AGENTS</div>
            {agents.map(a => (
              <div key={a.id} onClick={() => { setView("agents"); setSelectedAgent(a.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "6px 0", cursor: "pointer",
                  borderBottom: `1px solid ${C.border}`,
                }}>
                <StatusDot status={a.status} />
                <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{a.id}</span>
                {a.default && <span style={{ fontSize: 9, color: C.accent }}>●</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: "36px 48px", overflowY: "auto", maxWidth: 860 }}>
          {view === "agents" && !agentDetail && (
            <AgentList agents={agents} onSelect={setSelectedAgent} onAdd={addAgent} />
          )}
          {view === "agents" && agentDetail && (
            <AgentDetail agent={agentDetail} onSave={saveAgent} onBack={() => setSelectedAgent(null)} />
          )}
          {view === "bindings" && (
            <Bindings agents={agents} bindings={bindings} onAdd={addBinding} onDelete={deleteBinding} onReorder={reorderBinding} />
          )}
          {view === "session" && (
            <SessionConfig dmScope={dmScope} onChange={setDmScope} />
          )}
          {view === "preview" && (
            <Preview agents={agents} bindings={bindings} dmScope={dmScope} onApply={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
}
