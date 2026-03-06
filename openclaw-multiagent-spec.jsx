import { useState } from "react";

const SPEC = {
  meta: {
    title: "OpenClaw GUI — Multi-Agent 协作配置模块",
    subtitle: "Feature Technical Specification",
    version: "v0.1 · Draft",
    author: "待填写",
    date: "March 2026",
    status: "Draft",
  },
  sections: [
    {
      id: "overview",
      zh: "项目概述",
      en: "Overview",
      icon: "01",
      color: "#60a5fa",
      content: [
        {
          heading: "背景与问题陈述",
          body: `OpenClaw 是一个功能强大的开源 AI Agent 框架，支持多渠道接入（WhatsApp、Telegram、Discord 等）和多 Agent 隔离运行。但其配置方式完全依赖手动编辑 ~/.openclaw/openclaw.json 文件，存在以下核心痛点：

• 配置结构复杂，嵌套层次深（agents.list、bindings、channels、session 等），新手极易出错
• 多 Agent 协作需要同时理解 agents.list、bindings、agentDir、workspace 等多个概念并手动协调
• 无可视化反馈，配置错误难以调试（如 binding 路由失效、session 隔离未生效）
• Sub-agent 的 spawn 和 orchestrator 模式完全无图形化支持
• 安全配置（per-channel-peer session 隔离、tools 权限）极易漏配导致数据泄漏风险`,
        },
        {
          heading: "产品定位",
          body: `在 OpenClaw 原生能力之上，构建一个友好的图形化配置界面（Web UI），第一个功能模块聚焦：帮助用户通过可视化方式配置并管理多 Agent 协作体系，最终生成合法的 openclaw.json 配置并写入系统。`,
        },
        {
          heading: "成功指标",
          body: `• 用户无需阅读文档，在 10 分钟内完成一个 2-agent 协作配置并成功运行
• 配置导出零错误率（通过 openclaw config validate 校验）
• 用户理解 binding 路由逻辑的认知负担降低（可通过用户测试验证）
• 覆盖 OpenClaw 官方文档中所有 multi-agent 核心配置项`,
        },
        {
          heading: "本期范围（In Scope）",
          body: `✅ Agent 列表管理（创建、编辑、删除 agent）
✅ Agent 身份配置（id、name、workspace、SOUL.md 内容、model 选择）
✅ Binding 路由配置（channel、accountId、peer 匹配规则）
✅ Session 隔离模式配置（dmScope、per-channel-peer 安全模式）
✅ Sub-agent 模式开关（是否允许 orchestrator 模式）
✅ Per-agent 工具权限配置（tools allow/deny list）
✅ 配置预览与一键导出/写入 openclaw.json`,
        },
        {
          heading: "暂不包含（Out of Scope）",
          body: `❌ 渠道账号管理（WhatsApp 登录、Telegram Bot 创建等）
❌ 模型 Auth Profile 管理（API Key 轮换等）
❌ Skills 市场与安装
❌ 实时对话监控 / Session 查看
❌ Cron job 调度配置`,
        },
      ],
    },
    {
      id: "users",
      zh: "目标用户",
      en: "Users",
      icon: "02",
      color: "#a78bfa",
      content: [
        {
          heading: "主要用户",
          body: `技术型个人用户 / 独立开发者：
• 已安装并运行 OpenClaw，有 1+ 个 agent 在跑
• 熟悉 JSON 配置但觉得多 agent 配置太繁琐
• 希望搭建"Orchestrator + 多个专职 Sub-agent"模式（如：写作 agent + 代码 agent + 研究 agent）
• 痛点：不清楚 binding 优先级、workspace 隔离规则、session dmScope 的正确值`,
        },
        {
          heading: "次要用户",
          body: `小团队 / 家庭共用场景：
• 多人共用一台 OpenClaw 服务器，每人需要独立的 agent 和 session
• 需要将不同渠道账号（WhatsApp、Telegram）路由到不同 agent
• 对 JSON 配置不熟悉，需要完全图形化操作`,
        },
        {
          heading: "典型用户旅程",
          body: `场景：用户想搭建一个"主 Agent 负责协调，子 Agent 专注代码审查"的 2-agent 系统

1. 打开 GUI → 进入"Multi-Agent"模块
2. 看到当前已有 1 个默认 agent（main）
3. 点击"添加 Agent" → 填写 id: code-reviewer，选择 workspace 路径，填写 SOUL.md 角色描述
4. 在"Bindings"区域添加规则：将 Discord 服务器 #code-review 频道路由到 code-reviewer agent
5. 在"Session 安全"区域开启 per-channel-peer 隔离（系统自动提示多用户环境下必须开启）
6. 为 code-reviewer 开启 exec 工具，为 main agent 关闭
7. 点击"预览配置" → 查看生成的 JSON 差异
8. 点击"应用配置" → GUI 调用 openclaw config set 写入并 restart gateway
9. 成功提示 + 可跳转到 agent 状态页`,
        },
      ],
    },
    {
      id: "requirements",
      zh: "功能需求",
      en: "Requirements",
      icon: "03",
      color: "#34d399",
      content: [
        {
          heading: "核心功能需求（Functional Requirements）",
          body: `FR-01  Agent 管理
  · 系统须支持创建新 agent，必填字段：id（唯一）、workspace 路径
  · 系统须支持为每个 agent 设置可选字段：display name、emoji、model、agentDir
  · 系统须支持内联编辑 SOUL.md / AGENTS.md 内容（Markdown 编辑器）
  · 系统须支持设置 default: true 的 fallback agent（全局唯一）
  · 系统须防止两个 agent 共享同一 agentDir（校验冲突）

FR-02  Binding 路由配置
  · 系统须支持添加/编辑/删除 binding 规则
  · 每条 binding 须配置：agentId（下拉选择）、channel（下拉）、match 条件
  · match 条件支持：peer.kind（direct/group）、peer.id、guildId、accountId
  · 系统须可视化展示 binding 优先级顺序（拖拽排序）
  · 系统须高亮显示"无 binding 覆盖"的 agent 为默认 fallback

FR-03  Session 安全配置
  · 系统须提供 dmScope 选项：main / per-peer / per-channel-peer / per-account-channel-peer
  · 当用户选择 main 时，系统须显示安全警告："多用户环境下可能导致上下文泄漏"
  · 系统须支持配置 identityLinks（跨渠道身份映射）

FR-04  工具权限（Per-Agent Tools）
  · 系统须支持为每个 agent 配置 tools 的 allow/deny list
  · 工具列表应包含常见工具：exec、filesystem、web、memory 等
  · 系统须标注哪些工具属于高权限（elevated），并提示风险

FR-05  配置导出与应用
  · 系统须提供"预览 JSON diff"功能（当前配置 vs 新配置对比）
  · 系统须支持"导出为文件"和"直接写入并重启 Gateway"两种模式
  · 写入前须调用 openclaw config validate 验证，失败时显示详细错误`,
        },
        {
          heading: "非功能需求（Non-Functional Requirements）",
          body: `NFR-01  易用性：首次使用用户在无文档指引下，10 分钟内完成基础多 agent 配置
NFR-02  安全性：GUI 不存储 API Key，所有敏感配置通过 openclaw CLI 写入，不走 HTTP 明文传输
NFR-03  兼容性：支持 OpenClaw v2026.x 最新配置 Schema，需做版本检测
NFR-04  性能：配置页面加载时间 < 1s，JSON 预览渲染 < 200ms
NFR-05  可靠性：若 openclaw gateway restart 失败，自动回滚配置并显示 diff`,
        },
        {
          heading: "约束与假设",
          body: `· 假设用户本地已安装 OpenClaw，GUI 通过 localhost:18789（默认 Gateway 端口）通信
· GUI 以 Web App 形式运行，通过 OpenClaw REST API 读写配置（需 auth.token 认证）
· 不假设用户了解 OpenClaw 内部概念，所有术语需配 tooltip 解释
· OpenClaw 配置 Schema 以官方 docs.openclaw.ai 为准，版本变更需重新适配`,
        },
      ],
    },
    {
      id: "design",
      zh: "技术设计",
      en: "Technical Design",
      icon: "04",
      color: "#fbbf24",
      content: [
        {
          heading: "整体架构（方案 A：直连 Gateway WebSocket）",
          body: `【已确认】采用方案 A：Web UI 直接通过 WebSocket 连接 OpenClaw Gateway，无需独立后端服务。

  Browser (React SPA)
       ↕ WebSocket  ws://localhost:18789
  OpenClaw Gateway（本地运行）
       ↕ 读写 ~/.openclaw/openclaw.json
       ↕ 管理 ~/.openclaw/agents/<id>/ 目录

调用方式：openclaw gateway call ... 对应的 WS RPC 协议
  config.get    → 读取当前完整配置
  config.patch  → 写入配置差量（patch，非全量覆盖）
  config.apply  → 应用配置并触发 Gateway 内部 reload
  agent.list    → 获取所有 agent 运行状态

选择理由：
  ✅ 零后端进程，用户只需运行一个 OpenClaw Gateway
  ✅ Gateway 状态变更可实时推送到 UI（无需轮询）
  ✅ 与 openclaw gateway call CLI 入口完全同协议，行为一致
  ⚠️ 需在前端封装 WS RPC 客户端层（含重连、请求队列、超时）
  ⚠️ Gateway WS 协议变更时前端需同步跟进`,
        },
        {
          heading: "WebSocket RPC 客户端设计",
          body: `// WS RPC 封装层（src/lib/gateway-client.ts）
// 职责：连接管理、消息序列化、请求/响应匹配、重连

interface RpcRequest {
  id: string;          // 请求唯一 ID（UUID），用于匹配响应
  method: string;      // e.g. "config.get"
  params?: unknown;
}

interface RpcResponse {
  id: string;          // 对应请求 ID
  result?: unknown;
  error?: { code: number; message: string };
}

class GatewayClient {
  connect(url: string, token: string): Promise<void>
  call<T>(method: string, params?: unknown): Promise<T>
  // call() 内部：发送 RpcRequest，等待匹配 id 的 RpcResponse
  // 超时 10s，自动重试 3 次
  on(event: string, handler: (data: unknown) => void): void
  // 监听 Gateway 主动推送（agent 状态变更、配置 reload 完成等）
  disconnect(): void
}

// 使用示例
const client = new GatewayClient();
await client.connect("ws://localhost:18789", authToken);

const config = await client.call<OpenClawConfig>("config.get");
await client.call("config.patch", { agents: { list: [...] } });
await client.call("config.apply");   // 触发 Gateway reload`,
        },
        {
          heading: "前端页面结构",
          body: `/multi-agent                    ← 多 Agent 模块入口（含 WS 连接状态指示）
  /multi-agent/agents           ← Agent 列表 & 创建
  /multi-agent/agents/[id]      ← 单个 Agent 详情编辑
    · 基础信息（id, workspace, model）
    · SOUL.md 内联编辑器
    · 工具权限面板（allow/deny）
  /multi-agent/bindings         ← Binding 路由规则（拖拽排序）
  /multi-agent/session          ← Session 隔离安全配置
  /multi-agent/preview          ← JSON Diff 预览 & config.patch + config.apply`,
        },
        {
          heading: "关键数据结构（UI State → RPC 参数映射）",
          body: `// UI 草稿状态（Zustand store）→ config.patch 参数

interface AgentConfig {
  id: string;               // → agents.list[].id
  default?: boolean;        // → agents.list[].default
  workspace: string;        // → agents.list[].workspace
  agentDir?: string;        // → agents.list[].agentDir
  model?: { primary: string; fallbacks?: string[] };
  tools?: { allow?: string[]; deny?: string[] };
  soulContent?: string;     // 单独处理：写入 workspace/SOUL.md
                            // （通过 config.patch 的 fileWrites 字段，或独立 RPC）
}

interface BindingRule {
  agentId: string;          // → bindings[].agentId
  channel: string;          // → bindings[].match.channel
  accountId?: string;       // → bindings[].match.accountId
  peer?: { kind: 'direct' | 'group'; id?: string };
  guildId?: string;
}

interface SessionConfig {
  dmScope: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer';
  identityLinks?: Record<string, string[]>;
}

// 配置应用流程
// 1. UI 修改 → 本地 draft state 更新
// 2. 点击"预览" → diff(current, draft) 渲染
// 3. 点击"应用" → client.call("config.patch", delta)
//                → client.call("config.apply")
//                → 监听 Gateway 推送 reload 完成事件`,
        },
        {
          heading: "连接状态管理 & 错误处理",
          body: `WS 连接状态机（UI 顶部常驻状态栏显示）：
  DISCONNECTED → CONNECTING → CONNECTED → ERROR → RECONNECTING

断线重连策略：
  · 指数退避：1s → 2s → 4s → 8s（最大 30s）
  · 重连成功后自动重新 call config.get 同步最新状态
  · 用户在断线期间的编辑保留在本地 draft，不丢失

Gateway reload 失败处理：
  · config.apply 返回 error → UI 展示错误详情
  · 自动 call config.patch 回滚到 apply 前的快照
  · 显示 before/after diff，引导用户定位问题字段

auth.token 认证：
  · WS 握手阶段通过 URL query param 或首条消息传递 token
  · token 从本地 localStorage 读取（用户首次配置时填写）
  · token 失效时跳转到连接设置页`,
        },
        {
          heading: "Tech Stack",
          body: `Frontend:    React 19 + Vite + TypeScript（纯 SPA，无 SSR 需要）
UI:          Tailwind CSS + Radix UI（无障碍组件）
WS 客户端:   原生 WebSocket API 封装（不引入额外依赖）
编辑器:      CodeMirror 6（SOUL.md Markdown / JSON diff 预览）
拖拽排序:    @dnd-kit/core（Binding 优先级排序）
状态管理:    Zustand（配置草稿 + WS 连接状态）
实时推送:    Gateway WS 主动推送（无需 SWR/polling）
打包部署:    Vite build → 静态文件，由 Gateway 内嵌托管（访问 localhost:18789/ui）
             或 Tauri 打包为桌面 App（可选）`,
        },
      ],
    },
    {
      id: "edge",
      zh: "边界与风险",
      en: "Edge Cases & Risks",
      icon: "05",
      color: "#f87171",
      content: [
        {
          heading: "关键边界场景",
          body: `EC-01  Agent ID 冲突：用户试图创建与已有 agent 相同 id → 实时校验，阻止提交
EC-02  agentDir 共享：两个 agent 配置了同一 agentDir → 显示错误："会导致 auth/session 碰撞"
EC-03  无 default agent：所有 agent 的 default 均为 false → 警告提示，自动建议设置一个
EC-04  Binding 无法匹配：新建 binding 引用了不存在的 agentId → 实时联动校验
EC-05  SOUL.md 文件写入权限不足：workspace 路径不可写 → config.patch 返回 error，提示用户检查路径权限
EC-06  config.apply 失败：config.patch 成功但 apply 返回 error → 自动回滚至 apply 前快照，显示 before/after diff
EC-07  WS 断线冲突：用户编辑草稿期间 Gateway 被其他进程修改配置 → apply 前做 config.get 对比，冲突时提示用户选择合并或覆盖
EC-08  WS 连接中断：用户编辑中途断线 → 本地 draft 保留，重连后提示是否同步远端最新配置
EC-09  OpenClaw 版本不兼容：旧版 Gateway 不支持某 RPC 方法或配置字段 → WS 握手时做版本检测，灰化不支持的 UI 区域`,
        },
        {
          heading: "安全风险",
          body: `Risk-01  配置泄漏：WS 连接若被代理或转发可能暴露配置内容
  缓解：仅允许 ws://localhost 连接（不对外暴露），auth.token 在握手阶段验证，明确拒绝非本地来源

Risk-02  Session 隔离漏配：用户在多用户环境未开启 per-channel-peer
  缓解：检测到 agents.list 有多个 agent 时，自动弹出安全引导提示

Risk-03  恶意 Skill 通过 shared skills 目录影响所有 agent
  缓解：在 shared skills 路径配置处添加风险提示 banner

Risk-04  SOUL.md 内容注入：用户在 SOUL.md 中写入 prompt injection 内容
  缓解：添加内容警告提示（不做过滤，保留用户自由度）`,
        },
      ],
    },
    {
      id: "delivery",
      zh: "交付计划",
      en: "Delivery",
      icon: "06",
      color: "#fb923c",
      content: [
        {
          heading: "里程碑",
          body: `Week 1-2   【基础框架】
  · 搭建 Next.js 项目结构
  · 实现 OpenClaw Gateway API 通信层（读/写/validate）
  · Agent 列表页（展示已有 agents，支持增删）

Week 3-4   【核心配置】
  · 单 Agent 详情编辑页（workspace、model、SOUL.md 编辑器）
  · Per-agent 工具权限面板
  · Binding 路由配置页 + 拖拽排序

Week 5     【安全与预览】
  · Session 安全配置页 + 安全警告提示
  · JSON Diff 预览页
  · 配置写入 + Gateway restart 流程

Week 6     【测试与打磨】
  · 端到端测试（覆盖 EC-01 ~ EC-07）
  · 用户测试（≥3 名真实用户完成完整旅程）
  · 文档 & README`,
        },
        {
          heading: "测试计划",
          body: `单元测试：配置 Schema 序列化/反序列化、ID 冲突校验、binding 合法性校验
集成测试：与真实 OpenClaw Gateway 联调（本地测试环境）
E2E 测试：Playwright 模拟完整用户旅程（添加 agent → 配置 binding → 应用配置）
安全测试：验证 auth.token 缺失时 API 调用被拒绝
回滚测试：模拟 gateway restart 失败，验证配置自动回滚`,
        },
        {
          heading: "依赖项",
          body: `· OpenClaw Gateway REST API 需支持 PUT /api/config（确认 v2026.x 已提供）
· OpenClaw 官方配置 Schema 文档（docs.openclaw.ai）需保持同步
· 设计稿（如需 UI/UX 设计师介入，需提前 1 周交付）`,
        },
        {
          heading: "开放问题",
          body: `❓ OpenClaw Gateway 是否有官方 REST API，还是需要我们包装 CLI 调用？（需技术确认）
❓ 是否支持远程部署场景（非 localhost），如 DigitalOcean 托管的 OpenClaw？
❓ 是否需要支持多套配置文件（Profile）切换？
❓ 初版是否需要 Tauri 打包为桌面 App，还是纯 Web 即可？
❓ SOUL.md 的内容由用户从头编写，还是提供角色模板库？`,
        },
      ],
    },
  ],
};

const STATUS_COLORS = {
  Draft: { bg: "#1c1a14", text: "#fbbf24", border: "#3d3010" },
  Review: { bg: "#0f1a2e", text: "#60a5fa", border: "#1e3a5f" },
  Approved: { bg: "#0f2318", text: "#34d399", border: "#1a4a2e" },
};

export default function OpenClawSpec() {
  const [activeSection, setActiveSection] = useState("overview");
  const [lang, setLang] = useState("zh");

  const section = SPEC.sections.find((s) => s.id === activeSection);
  const statusStyle = STATUS_COLORS[SPEC.meta.status] || STATUS_COLORS.Draft;

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'Fira Code', 'Consolas', monospace",
      background: "#0a0a0c",
      minHeight: "100vh",
      color: "#c9d1d9",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Top bar */}
      <div style={{
        background: "#0d0d10",
        borderBottom: "1px solid #161620",
        padding: "14px 28px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{
          fontSize: "10px", letterSpacing: "3px", color: "#444",
          textTransform: "uppercase", marginRight: 8,
        }}>
          TECH SPEC
        </div>
        <div style={{ fontSize: "15px", color: "#e6edf3", fontWeight: "600", flex: 1 }}>
          {SPEC.meta.title}
        </div>
        <div style={{
          fontSize: "10px", padding: "3px 10px",
          background: statusStyle.bg,
          color: statusStyle.text,
          border: `1px solid ${statusStyle.border}`,
          letterSpacing: "1px",
        }}>
          {SPEC.meta.status.toUpperCase()}
        </div>
        <div style={{ fontSize: "11px", color: "#444" }}>{SPEC.meta.version}</div>
        <button
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          style={{
            background: "none", border: "1px solid #222", color: "#555",
            padding: "4px 10px", fontSize: "10px", cursor: "pointer",
            letterSpacing: "1px",
          }}
        >
          {lang === "zh" ? "ZH" : "EN"}
        </button>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        <div style={{
          width: "180px", flexShrink: 0,
          background: "#0a0a0c",
          borderRight: "1px solid #161620",
          padding: "20px 0",
        }}>
          {/* Meta */}
          <div style={{ padding: "0 16px 20px", borderBottom: "1px solid #161620", marginBottom: 16 }}>
            <div style={{ fontSize: "10px", color: "#333", marginBottom: 4 }}>DATE</div>
            <div style={{ fontSize: "11px", color: "#555" }}>{SPEC.meta.date}</div>
          </div>

          {SPEC.sections.map((sec) => {
            const isActive = sec.id === activeSection;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: isActive ? "#111116" : "none",
                  border: "none",
                  borderLeft: `2px solid ${isActive ? sec.color : "transparent"}`,
                  padding: "10px 16px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  fontSize: "10px", color: isActive ? sec.color : "#333",
                  letterSpacing: "1px", marginBottom: 3,
                }}>
                  {sec.icon}
                </div>
                <div style={{
                  fontSize: "11px",
                  color: isActive ? "#e6edf3" : "#555",
                  lineHeight: 1.3,
                }}>
                  {lang === "zh" ? sec.zh : sec.en}
                </div>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "36px 48px", maxWidth: "900px" }}>
          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "baseline", gap: 16,
            marginBottom: 36, paddingBottom: 16,
            borderBottom: `1px solid ${section.color}22`,
          }}>
            <span style={{
              fontSize: "11px", color: section.color,
              letterSpacing: "2px", fontWeight: "600",
            }}>
              {section.icon}
            </span>
            <h2 style={{
              margin: 0, fontSize: "20px", fontWeight: "500",
              color: "#e6edf3", letterSpacing: "-0.3px",
            }}>
              {lang === "zh" ? section.zh : section.en}
            </h2>
          </div>

          {/* Content blocks */}
          {section.content.map((block, i) => (
            <div key={i} style={{ marginBottom: 36 }}>
              <div style={{
                fontSize: "10px", letterSpacing: "2px",
                textTransform: "uppercase",
                color: section.color,
                marginBottom: 12,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  display: "inline-block", width: 4, height: 4,
                  background: section.color, borderRadius: "50%",
                }} />
                {block.heading}
              </div>
              <div style={{
                background: "#0d0d10",
                border: "1px solid #161620",
                borderLeft: `3px solid ${section.color}44`,
                padding: "16px 20px",
                fontSize: "12.5px",
                lineHeight: "1.8",
                color: "#8b949e",
                whiteSpace: "pre-wrap",
                fontFamily: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
              }}>
                {block.body}
              </div>
            </div>
          ))}

          {/* Navigation */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            marginTop: 48, paddingTop: 20,
            borderTop: "1px solid #161620",
          }}>
            {SPEC.sections.findIndex(s => s.id === activeSection) > 0 && (
              <button
                onClick={() => setActiveSection(
                  SPEC.sections[SPEC.sections.findIndex(s => s.id === activeSection) - 1].id
                )}
                style={{
                  background: "none", border: "1px solid #1c1c22",
                  color: "#444", padding: "8px 16px",
                  fontSize: "10px", letterSpacing: "2px", cursor: "pointer",
                }}
              >
                ← PREV
              </button>
            )}
            <div />
            {SPEC.sections.findIndex(s => s.id === activeSection) < SPEC.sections.length - 1 && (
              <button
                onClick={() => setActiveSection(
                  SPEC.sections[SPEC.sections.findIndex(s => s.id === activeSection) + 1].id
                )}
                style={{
                  background: "none", border: "1px solid #222",
                  color: "#666", padding: "8px 16px",
                  fontSize: "10px", letterSpacing: "2px", cursor: "pointer",
                }}
              >
                NEXT →
              </button>
            )}
          </div>
        </div>

        {/* Right panel - quick nav */}
        <div style={{
          width: "200px", flexShrink: 0,
          borderLeft: "1px solid #161620",
          padding: "24px 16px",
          background: "#0a0a0c",
        }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#333", marginBottom: 16 }}>
            本节内容
          </div>
          {section.content.map((block, i) => (
            <div key={i} style={{
              fontSize: "10px", color: "#3a3a44",
              padding: "5px 0",
              borderBottom: "1px solid #111116",
              lineHeight: 1.4,
            }}>
              <span style={{ color: section.color, marginRight: 6 }}>·</span>
              {block.heading}
            </div>
          ))}

          {/* Summary card */}
          <div style={{
            marginTop: 32,
            background: "#0d0d10",
            border: "1px solid #161620",
            padding: "14px",
          }}>
            <div style={{ fontSize: "10px", letterSpacing: "1px", color: "#333", marginBottom: 10 }}>
              项目信息
            </div>
            {[
              ["版本", SPEC.meta.version],
              ["状态", SPEC.meta.status],
              ["作者", SPEC.meta.author],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "10px", color: "#333" }}>{k}</span>
                <span style={{ fontSize: "10px", color: "#555" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
