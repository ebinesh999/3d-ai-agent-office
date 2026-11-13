# 🏢 3D AI Agent Office

**A low-poly 3D virtual office where local-LLM agents walk, talk, think and remember.**

Autonomous AI agents with distinct roles move between workstations, hold conversations with each other, and keep persistent memories, all driven by a local Large Language Model. Watch their private thoughts live in a side panel.

Built using React, Three.js, Node.js, TypeScript, WebSockets, SQLite, and Ollama.

> **Zero lock-in, fully local.** Everything runs on your machine with [Ollama](https://ollama.com). No API keys, no cloud, no cost per token.

<!-- Add a screenshot or GIF of the office here, e.g. <img src="docs/screenshot.png" width="800" alt="3D AI Agent Office"> -->

---

## ✨ What Can It Do?

| Feature | Description |
|---|---|
| 🧑‍💼 **Autonomous Agents** | Three agents (Ada, Ben and Cleo) with different roles and personalities decide their own actions |
| 🧠 **Local LLM Brain** | Each agent asks Ollama (Llama 3.2 by default) what to do next and gets back structured JSON |
| 🚶 **Animated Characters** | Mixamo-rigged characters with idle and walk animations, crossfaded by status |
| 💬 **Agent-to-Agent Chat** | Agents address each other by name, walk over to talk, and reply to what they hear |
| 🗯️ **Speech Bubbles** | What an agent says appears above its head in the 3D scene |
| 💾 **Persistent Memory** | Thoughts, actions, overheard lines and long-term notes are stored in SQLite and survive restarts |
| 🔍 **Thoughts Dashboard** | A live side panel shows what each agent is thinking, doing, hearing and remembering |
| 🖱️ **Manual Control** | Click a character, then a desk, to send that agent there |
| 🔌 **Real-Time Sync** | A WebSocket server owns the world state, and the browser only renders it |

---

## 🎬 How It Works

```
Every few seconds, for each agent:

  Role + surroundings + memories
              │
              ▼
        Ollama (LLM)
              │
              ▼
  {"thought": "...", "action": "walk_to", "target": "desk-2"}
              │
              ▼
   Server validates the reply ──▶ invalid? ignore it
              │
              ▼
   Execute: walk / speak ──▶ save to SQLite ──▶ broadcast over WebSocket
              │
              ▼
   Browser renders the agent, its bubble and the thoughts panel
```

Model output is treated as **untrusted**: it is parsed and checked against real desk and agent ids before anything happens. Walking to a desk someone else holds is refused, and the refusal goes into the agent's memory.

---

## 🏗 Architecture

```
3d-ai-agent-office/
├── shared/
│   └── protocol.ts        # Message and state types used by server and frontend
├── server/
│   ├── index.ts           # World state, 20 Hz movement tick, WebSocket broadcast
│   ├── agent.ts           # Per-agent Ollama loop, prompt building, output validation
│   └── db.ts              # SQLite memory (node:sqlite)
├── src/
│   ├── App.tsx            # Scene, floor, desks, layout
│   ├── Character.tsx      # Animated character renderer
│   ├── Desk.tsx           # Desk, monitor and chair
│   ├── ThoughtPanel.tsx   # Side panel: thoughts, actions, memories
│   └── useWorld.ts        # WebSocket client hook
└── public/models/
    └── character.glb      # Default animated character
```

**Data flow**

```
Ollama ◀── HTTP ── Agent loops ──▶ World state ──▶ SQLite memory
                        │              │
                        └──────────────┴── WebSocket ──▶ Browser (React Three Fiber)
```

The server is the single source of truth. The frontend holds no simulation of its own: it smooths the 20 Hz snapshots it receives into per-frame motion.

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 22.13+ | Runtime (uses the built-in `node:sqlite`) |
| Ollama | Latest | Runs the local LLM |
| Llama 3.2 | `llama3.2` | Default model for agent decisions |

### Setup

```bash
git clone https://github.com/ebinesh999/3d-ai-agent-office.git
cd 3d-ai-agent-office

npm install
ollama pull llama3.2
npm run dev:all
```

Open the local URL displayed by Vite in your browser (usually http://localhost:5173). The agent server runs on `ws://localhost:8080`.

| Script | Description |
|---|---|
| `npm run dev:all` | Start the server and the frontend together |
| `npm run server` | Start only the WebSocket / agent server |
| `npm run dev` | Start only the frontend |
| `npm run build` | Type-check and build the frontend |

🎉 The three agents will start thinking within a few seconds.

---

## 🔧 Configuration

### Change the LLM Model

Set environment variables before starting the server:

```bash
OLLAMA_MODEL=llama3.1:8b npm run server
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | WebSocket server port |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Model used for agent decisions |
| `AGENT_INTERVAL_MS` | `5000` | Delay between an agent's turns |
| `AGENT_DB` | `server/data/memory.db` | SQLite file path (or `:memory:`) |
| `VITE_WS_URL` | `ws://<host>:8080` | Server URL the frontend connects to |

### Add or Edit Agents

Agents are defined in the `cast` array in `server/index.ts`. The frontend picks up new agents automatically.

```ts
const cast = [
  {
    id: 'ada',
    name: 'Ada',
    color: '#e0563f',
    x: -1,
    z: 0,
    role: 'senior software engineer: practical, a bit dry, cares about shipping working code',
  },
  // add more agents here
]
```

### Use Your Own Character

Download a character from [Mixamo](https://www.mixamo.com) with *Idle* and *Walk* animations, convert it to `.glb`, and replace `public/models/character.glb`. Animation clips are matched by name (`/idle/i` and `/walk/i`). If the file fails to load, the app falls back to a simple capsule.

---

## 🍴 Fork It & Build Your Own

### Step 1: Fork and clone

Fork the repo on GitHub, then clone your copy and run `npm install`.

### Step 2: Redesign the cast

Edit `cast` in `server/index.ts` to create your own team: a support desk, a newsroom, a game studio.

### Step 3: Reshape the office

Desks are defined in `server/index.ts` and drawn by `src/Desk.tsx`. Add more desks or new furniture components.

### Step 4: Teach them new actions

Add an action to the prompt and the validator in `server/agent.ts` (see `parseTurn`), then handle it in the server's `execute` step. Keep every new action validated against real world state.

---

## 💡 Ideas: What Can You Build With This?

| Use Case | Description |
|---|---|
| 🎮 **Game NPCs** | Characters with memory and personality for a small simulation or game |
| 🧪 **Multi-Agent Research** | Observe how small LLM agents coordinate, talk and drift over time |
| 🎓 **Teaching Tool** | Demonstrate agent loops, tool-style actions and memory visually |
| 🏫 **Role-Play Simulations** | Stage a standup, an interview or a support call between agents |
| 🎬 **Storytelling** | Let characters improvise scenes and read their private thoughts |

---

## 🧪 Testing

The project has no automated test suite yet. Use the type-checks:

```bash
npm run build        # type-check + build the frontend
npx tsc -p server    # type-check the server
```

---

## ⚠️ Known Limitations

- Agents walk in straight lines and do not avoid desks or each other.
- Small local models can produce repetitive dialogue. A larger `OLLAMA_MODEL` helps if your hardware allows.
- Several agents share one Ollama instance, so responses can be slow on CPU-only machines.
- The WebSocket server has no authentication, so run it on localhost only.

**Troubleshooting**

- *"Connecting to server…" never goes away:* the server isn't running or its port is taken. Check `npm run server`, or set `PORT` and `VITE_WS_URL`.
- *`EADDRINUSE` on port 8080:* another server (possibly an old copy of this one) is already listening. Stop it or use a different `PORT`.
- *Agents never act:* make sure Ollama is running and the model is pulled (`ollama list`).
- *Reset agent memory:* stop the server and delete the files in `server/data/`.

---

## 🗺 Roadmap

- [x] Low-poly 3D office with orbit camera
- [x] Animated characters (idle / walk)
- [x] Local LLM agent loop with validated JSON actions
- [x] Agent-to-agent conversation with speech bubbles
- [x] Persistent SQLite memory per agent
- [x] Live thoughts and memory dashboard
- [ ] Pathfinding around desks and other agents
- [ ] Sitting animation when working at a desk
- [ ] Automated tests
- [ ] Docker deployment
- [ ] Optional OpenAI-compatible API backend

---

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Make your changes and run `npm run build` and `npx tsc -p server`.
4. Commit and push your branch.
5. Open a pull request.

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.


The default animated character is `Soldier.glb` from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf).

Original project and third-party assets remain subject to their respective copyright and licence terms.

---

**Built with** React · Three.js · React Three Fiber · Node.js · SQLite · Ollama

**Star ⭐ this repo if you find it useful!**
