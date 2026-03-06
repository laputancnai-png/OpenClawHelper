# 🐾 OpenClawHelper

> 一个让所有人都能轻松配置 OpenClaw 多 Agent 协作系统的友好界面

---

## 📁 项目结构

```
OpenClawHelper/
├── src/
│   ├── lib/
│   │   ├── gateway-ws-types.ts     # WS 协议类型（protocol v3，已对照真实 Gateway 确认）
│   │   ├── gateway-client.ts       # WebSocket RPC 客户端（握手/重连/事件总线）
│   │   └── config-serialiser.ts    # UI state → JSON5 patch 序列化 + 校验
│   └── hooks/
│       ├── useGateway.ts           # WS hooks（连接/快照/多agent编辑工作流）
│       └── useFileServer.ts        # 文件 hooks（SOUL.md 读写）
│
├── server/
│   └── server.mjs                  # 本地 Node.js 文件服务器（port 3131）
│
├── prototypes/
│   ├── ui-friendly.jsx             # ✅ 主原型：面向普通用户的向导式界面
│   └── ui-technical.jsx            # 参考：早期技术风格版本
│
├── mock/
│   └── mock-gateway.mjs            # 本地开发用 Mock WS Gateway
│
├── docs/
│   └── tech-spec.jsx               # 交互式 Tech Spec
│
├── package.json
└── README.md
```

---

## 🚀 快速开始

```bash
npm install
npm run dev
# 启动两个服务：
#   UI        → http://localhost:5173
#   文件服务器 → http://localhost:3131
```

无真实 Gateway 时用 mock 模式：
```bash
npm run mock
# 启动 mock WS Gateway (18789) + 文件服务器 (3131)
```

---

## 🏗️ 确认后的架构

```
Browser (React SPA)
  │
  ├── WS  ws://localhost:18789 ──→ OpenClaw Gateway
  │         config.get / config.patch / config.apply
  │
  └── HTTP http://localhost:3131 ──→ 本地文件服务器 (server.mjs)
              GET  /api/workspace
              GET  /api/file?path=SOUL.md
              PUT  /api/file?path=SOUL.md
              PUT  /api/file?path=.agents/writer/SOUL.md
```

### 为什么需要本地文件服务器？

SOUL.md 是 workspace 下的普通文本文件，OpenClaw Gateway 没有提供
文件读写 RPC（`fs.write`、`agent.setFile` 均不存在）。
浏览器无法直接访问本地文件系统，所以需要一个轻量本地后端。

---

## 📋 真实 OpenClaw 配置结构（已从本地 Gateway 确认）

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai-codex/gpt-5.3-codex" },
      "workspace": "/home/user/.openclaw/workspace"
    },
    "list": [
      { "id": "main" }   ← 只有 id，其余继承 defaults
    ]
  },
  "bindings": [
    {
      "agentId": "main",
      "match": { "channel": "slack", "accountId": "default" }
    }
  ]
}
```

**重要：** `agents.list` 里的 agent 只需 `id`，其他字段全部从 `agents.defaults` 继承。
UI 在新增 agent 时需区分"覆盖 defaults"和"沿用 defaults"。

### Workspace 文件布局（已确认）

```
~/.openclaw/workspace/
  SOUL.md          ← main agent 的性格说明书（普通文本）
  AGENTS.md        ← 多 agent 协作说明
  IDENTITY.md      ← agent 身份定义
  USER.md          ← 用户偏好
  TOOLS.md         ← 工具权限说明
  .agents/
    writer/
      SOUL.md      ← writer agent 的性格说明书
    <id>/
      SOUL.md
```

---

## 🔌 WS 协议（protocol v3，已确认）

| RPC 方法 | 说明 |
|----------|------|
| `config.get` | 读取完整配置，返回含 `hash` 的 ConfigSnapshot |
| `config.patch` | deep merge，`raw` 为 JSON5 字符串，必须传 `baseHash` |
| `config.apply` | 全量替换，`raw` 为 JSON5 字符串，必须传 `baseHash` |

握手流程：
```
Server → connect.challenge (event)
Client → connect (req, role:"operator", auth.token)
Server → connect (res, ok:true)
```

---

## 📋 功能进度

| 模块 | 状态 |
|------|------|
| Tech Spec | ✅ |
| UI 原型（友好向导） | ✅ |
| WS 协议类型定义 | ✅ |
| GatewayClient | ✅ |
| config-serialiser + 校验 | ✅ |
| useGateway hooks | ✅ |
| 本地文件服务器 | ✅ |
| useFileServer hook | ✅ |
| UI 接入真实 Gateway | 🔜 下一步 |

---

## ❓ 仍待确认

1. 多 agent 时 `.agents/<id>/` 目录是 OpenClaw 自动创建，还是需要我们创建？
2. Gateway `connect.challenge` payload 里是否包含 `serverVersion`？
3. `config.patch` 后 Gateway 会推送什么 event 通知配置生效？
