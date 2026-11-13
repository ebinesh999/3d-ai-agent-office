import { WebSocketServer, WebSocket } from 'ws'
import { startAgentLoop, type ChatLine, type WalkResult, type WorldApi } from './agent'
import { addEntry, hasNote, recent, recentForClient } from './db'
import type { AgentState, ClientMessage, DeskInfo, LogKind, ServerMessage } from '../shared/protocol'

const PORT = Number(process.env.PORT ?? 8080)
const TICK_HZ = 20
const SPEED = 2.5
const FLOOR = 10
const SPEECH_MS = 6000
const CHAT_KEEP = 10
const HEAR_RANGE = 4.5 // metres: agents this close overhear speech even if it isn't addressed to them

// ---- World state (the single source of truth) ----
const desks: DeskInfo[] = [
  [-2.5, -2],
  [2.5, -2],
  [-2.5, 2],
  [2.5, 2],
].map(([x, z], i) => ({
  id: `desk-${i + 1}`,
  position: [x, 0, z] as [number, number, number],
  rotationY: z < 0 ? 0 : Math.PI,
}))

const cast: Pick<AgentState, 'id' | 'name' | 'role' | 'color' | 'x' | 'z'>[] = [
  { id: 'ada', name: 'Ada', color: '#e0563f', x: -1, z: 0, role: 'senior software engineer: practical, a bit dry, cares about shipping working code' },
  { id: 'ben', name: 'Ben', color: '#3d8fd6', x: 1, z: 0, role: 'UX designer: curious and enthusiastic, always asks how users will feel' },
  { id: 'cleo', name: 'Cleo', color: '#4caf6a', x: 0, z: 1.5, role: 'project manager: organised and upbeat, keeps the team on schedule' },
]

const agents = new Map<string, AgentState>()
for (const c of cast) {
  agents.set(c.id, { ...c, speech: null, speechTo: null, heading: 0, status: 'idle', deskId: null })
}

const targets = new Map<string, [number, number]>()
const speechTimers = new Map<string, ReturnType<typeof setTimeout>>()
const chat: ChatLine[] = []

function seatSpot(d: DeskInfo): [number, number] {
  const dist = 1.7 // behind the chair
  return [d.position[0] + Math.sin(d.rotationY) * dist, d.position[2] + Math.cos(d.rotationY) * dist]
}

/** Walk to a desk id or to another agent's id. */
function walkTo(agentId: string, targetId: string): WalkResult {
  const agent = agents.get(agentId)
  if (!agent) return { ok: false, reason: 'unknown agent' }

  const desk = desks.find((d) => d.id === targetId)
  if (desk) {
    const holder = [...agents.values()].find((o) => o.id !== agentId && o.deskId === desk.id)
    if (holder) return { ok: false, reason: `${desk.id} is taken by ${holder.name}` }
    targets.set(agentId, seatSpot(desk))
    agent.deskId = desk.id
    agent.status = 'walking'
    return { ok: true }
  }

  const other = agents.get(targetId)
  if (other && other.id !== agentId) {
    // Stop ~1.3m short of them, on the side we're approaching from
    const dx = agent.x - other.x
    const dz = agent.z - other.z
    const d = Math.hypot(dx, dz) || 1
    targets.set(agentId, [other.x + (dx / d) * 1.3, other.z + (dz / d) * 1.3])
    agent.deskId = null
    agent.status = 'walking'
    return { ok: true }
  }
  return { ok: false, reason: 'unknown target' }
}

function say(agentId: string, text: string, to?: string) {
  const agent = agents.get(agentId)
  if (!agent) return
  agent.speech = text
  agent.speechTo = to && agents.has(to) && to !== agentId ? to : null
  chat.push({ from: agentId, to: agent.speechTo, text })
  if (chat.length > CHAT_KEEP) chat.shift()

  // Whoever is addressed, or standing close enough, remembers having heard it.
  const toName = agent.speechTo ? agents.get(agent.speechTo)?.name : null
  for (const o of agents.values()) {
    if (o.id === agentId) continue
    const near = Math.hypot(o.x - agent.x, o.z - agent.z) <= HEAR_RANGE
    if (o.id !== agent.speechTo && !near) continue
    const dir = o.id === agent.speechTo ? 'to you' : toName ? `to ${toName}` : ''
    record(o.id, 'heard', `${agent.name} said${dir ? ` ${dir}` : ''}: "${text}"`)
  }
  clearTimeout(speechTimers.get(agentId))
  speechTimers.set(
    agentId,
    setTimeout(() => {
      agent.speech = null
      agent.speechTo = null
    }, SPEECH_MS),
  )
}

/** Persist an entry to the agent's SQLite memory and push it to every browser. */
function record(agentId: string, kind: LogKind, text: string) {
  if (kind === 'note' && hasNote(agentId, text)) return // don't store the same note twice
  const entry = addEntry(agentId, kind, text)
  const msg: ServerMessage = { type: 'log', entry }
  for (const c of wss.clients) send(c, msg)
}

function recall(agentId: string) {
  return {
    notes: recent(agentId, ['note'], 6).map((e) => e.text),
    events: recent(agentId, ['action', 'heard'], 8).map((e) => e.text),
  }
}

function angleDiff(a: number, b: number) {
  return ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI
}

function step(dt: number) {
  for (const a of agents.values()) {
    const target = targets.get(a.id)
    if (!target) continue
    const dx = target[0] - a.x
    const dz = target[1] - a.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.02) {
      a.x = target[0]
      a.z = target[1]
      targets.delete(a.id)
      a.status = a.deskId ? 'working' : 'idle'
      continue
    }
    const v = Math.min(SPEED, dist * 4) // ease out on arrival
    const s = Math.min(dist, v * dt)
    a.x += (dx / dist) * s
    a.z += (dz / dist) * s
    a.heading += angleDiff(a.heading, Math.atan2(dx, dz)) * (1 - Math.exp(-12 * dt))
    a.status = 'walking'
  }
}

// ---- Networking ----
const wss = new WebSocketServer({ port: PORT })

const send = (ws: WebSocket, msg: ServerMessage) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

wss.on('connection', (ws) => {
  send(ws, {
    type: 'init',
    desks,
    floor: FLOOR,
    agents: [...agents.values()],
    logs: recentForClient([...agents.keys()]),
  })

  ws.on('message', (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg?.type !== 'moveTo') return
    walkTo(msg.agentId, msg.deskId) // rejected (ignored) for unknown ids or taken desks
  })
})

let last = Date.now()
setInterval(() => {
  const now = Date.now()
  step(Math.min((now - last) / 1000, 0.1))
  last = now
  const msg: ServerMessage = { type: 'state', t: now, agents: [...agents.values()] }
  for (const c of wss.clients) send(c, msg)
}, 1000 / TICK_HZ)

console.log(`World server listening on ws://localhost:${PORT}`)

const world: WorldApi = {
  desks,
  agents: () => [...agents.values()],
  getAgent: (id) => agents.get(id),
  getChat: () => chat,
  walkTo,
  say,
  record,
  recall,
}
cast.forEach((c, i) => startAgentLoop(c.id, world, 1000 + i * 1500)) // staggered starts
