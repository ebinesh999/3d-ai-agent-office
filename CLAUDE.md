# CLAUDE.md

Low-poly 3D office where three LLM-driven agents (Ada, Ben, Cleo) walk between desks and talk to each other. Vite + React + TypeScript + React Three Fiber frontend; Node + WebSocket server that owns all world state; Ollama for agent decisions; SQLite for agent memory.

## Commands

```powershell
npm run dev:all   # server (ws://localhost:8080) + Vite (http://localhost:5173)
npm run server    # server only
npm run dev       # frontend only
npm run build     # tsc -b && vite build (frontend type-check + bundle)
npx tsc -p server # type-check the server (not covered by `npm run build`)
```

There is no test runner or linter. Verify changes with both type-checks above.

Requires Node 22.13+ (uses built-in `node:sqlite`) and a running Ollama with `llama3.2` pulled (`ollama pull llama3.2`).

## Architecture

**The server is the single source of truth. The frontend only renders what it sends.**

- `shared/protocol.ts`: message and state types imported by both sides. Change the wire format here first.
- `server/index.ts`: world state (desks, agents), 20 Hz movement tick, WebSocket broadcast, `walkTo` / `say` / `record` / `recall`.
- `server/agent.ts`: one Ollama loop per agent. Builds the prompt, calls `/api/chat` with `format: "json"`, validates the reply (`parseTurn`), executes the action.
- `server/db.ts`: SQLite memory (`server/data/memory.db`, git-ignored). One `entries` table; kinds are `thought | action | heard | note`.
- `src/useWorld.ts`: WebSocket client. Positions go in a ref (20 Hz, read per frame); status, speech and logs go in React state.
- `src/Character.tsx`: renders the latest snapshot with smoothing. Never decides movement. Loads `/models/character.glb`, falls back to a capsule if it fails.
- `src/ThoughtPanel.tsx`: side panel for each agent's thoughts, actions, overheard lines and notes.

Agent turn: the model returns `{thought, action: "walk_to"|"say", target|text|to, remember?}`. Model output is untrusted. It is validated against real desk and agent ids, and invalid output is logged and ignored.

## Conventions and gotchas

- Desk and agent ids are lowercase (`desk-1`, `ada`). `resolveId` in `agent.ts` is lenient about what models send (`desk_2`, `2`, `Ben`).
- To add an agent, add it to `cast` in `server/index.ts`. The frontend picks it up from the `init` message.
- Animated models: clips are matched by name (`/idle/i`, `/walk/i`). To swap in a Mixamo character, replace `public/models/character.glb`.
- Ollama is the bottleneck. Each agent waits for its previous call before scheduling the next (default 5 s, `AGENT_INTERVAL_MS`). With several servers running, one request can take 60 s and time out. That is handled with a warning and retry, not a bug.
- Env vars: `PORT` (8080), `OLLAMA_URL`, `OLLAMA_MODEL`, `AGENT_INTERVAL_MS`, `AGENT_DB` (path or `:memory:`), `VITE_WS_URL` (frontend).
- Known limitations: agents walk in straight lines (can clip through desks) and don't avoid each other.

## Working on Windows

- Shell is PowerShell/Git Bash. Bash `timeout` does not kill tsx's child process, so test servers leak and keep holding their port and the SQLite file. Find and stop them by PID.
- Before starting a test server, check what owns the port (`Get-NetTCPConnection -LocalPort 8080`). Another dev server may already be running. Use a different `PORT` for tests rather than killing it.
- Run throwaway servers with `AGENT_DB=:memory:` or a temp path so tests don't pollute `server/data/memory.db`.
