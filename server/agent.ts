import type { AgentState, DeskInfo, LogKind } from '../shared/protocol'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2'
const THINK_EVERY_MS = Number(process.env.AGENT_INTERVAL_MS ?? 5000)
const REQUEST_TIMEOUT_MS = 60000

export type Action =
  | { action: 'walk_to'; target: string }
  | { action: 'say'; text: string; to?: string }

/** A parsed model turn: private thought, one action, and an optional long-term note. */
export type Turn = { thought?: string; remember?: string; act?: Action }

export type ChatLine = { from: string; to: string | null; text: string }
export type WalkResult = { ok: true } | { ok: false; reason: string }

/** What the agent loops need from the world. The world stays owned by index.ts. */
export type WorldApi = {
  desks: DeskInfo[]
  agents: () => AgentState[]
  getAgent: (id: string) => AgentState | undefined
  getChat: () => ChatLine[]
  walkTo: (agentId: string, targetId: string) => WalkResult
  say: (agentId: string, text: string, to?: string) => void
  /** Persist + broadcast a log entry (thought, action, heard, note). */
  record: (agentId: string, kind: LogKind, text: string) => void
  /** Long-term notes and recent events pulled from the agent's SQLite memory. */
  recall: (agentId: string) => { notes: string[]; events: string[] }
}

// ---- Prompting ----

function nameOf(world: WorldApi, id: string | null) {
  return (id && world.getAgent(id)?.name) || 'everyone'
}

function describeWorld(me: AgentState, world: WorldApi): string {
  const others = world.agents().filter((a) => a.id !== me.id)

  const desks = world.desks.map((d) => {
    const holder = world.agents().find((a) => a.deskId === d.id)
    const who = !holder ? 'free' : holder.id === me.id ? 'yours' : `taken by ${holder.name}`
    const dist = Math.hypot(d.position[0] - me.x, d.position[2] - me.z).toFixed(1)
    return `- ${d.id}: ${who}, ${dist}m away`
  })

  const people = others.map((o) => {
    const dist = Math.hypot(o.x - me.x, o.z - me.z).toFixed(1)
    const doing = o.status === 'working' ? `working at ${o.deskId}` : o.status
    return `- ${o.id} (${o.name}, ${o.role.split(':')[0]}): ${dist}m away, ${doing}`
  })

  const log = world.getChat().map((c) => {
    const to = c.to === me.id ? 'you' : nameOf(world, c.to)
    const from = c.from === me.id ? 'You' : nameOf(world, c.from)
    return `- ${from} -> ${to}: "${c.text}"`
  })

  const lastHeard = [...world.getChat()].reverse().find((c) => c.from !== me.id)
  const addressedToMe = lastHeard?.to === me.id

  return [
    `You are at (${me.x.toFixed(1)}, ${me.z.toFixed(1)}). Status: ${me.status}${me.deskId ? ` at ${me.deskId}` : ''}.`,
    `Desks:\n${desks.join('\n')}`,
    `Colleagues:\n${people.join('\n')}`,
    log.length ? `Recent conversation (oldest first):\n${log.join('\n')}` : 'Nobody has spoken yet.',
    addressedToMe ? `${nameOf(world, lastHeard!.from)} just spoke to you. Reply to them.` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function buildMessages(me: AgentState, world: WorldApi) {
  const mem = world.recall(me.id)
  const system = [
    `You are ${me.name} (id "${me.id}"), an AI agent in a small 3D office with two colleagues. Your role: ${me.role}.`,
    'Each turn, think privately, then choose exactly ONE action. Reply with ONLY a JSON object, no other text:',
    '  {"thought": "<your private reasoning, 1-2 sentences>",',
    '   "action": "walk_to" | "say",',
    '   "target": "<desk id or colleague id>",        (only for walk_to; walking to a colleague lets you chat face to face)',
    '   "text": "<one short sentence, max 14 words>",  (only for say)',
    '   "to": "<colleague id>",                        (optional, for say)',
    '   "remember": "<a short fact worth keeping long-term>"}   (optional; use rarely, only for things that matter later)',
    'Talk to your colleagues like real coworkers: answer questions, react to what they said, bring up your own work.',
    'Use your memories for continuity. Stay in character. Do not repeat yourself. Do not walk to a desk that is taken.',
  ].join('\n')
  const user = [
    describeWorld(me, world),
    mem.notes.length ? `Things you decided to remember:\n${mem.notes.map((n) => `- ${n}`).join('\n')}` : '',
    mem.events.length ? `What you recently did and heard (oldest first):\n${mem.events.map((e) => `- ${e}`).join('\n')}` : '',
    'Choose your next action.',
  ]
    .filter(Boolean)
    .join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

// ---- Ollama + validation ----

async function askOllama(messages: unknown[]): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format: 'json',
      options: { temperature: 0.8, num_predict: 300 },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { message?: { content?: string } }
  return data.message?.content ?? ''
}

/** Resolve "desk_2", "Desk 2", "2", "Ben", "ben" to a canonical desk or agent id. */
function resolveId(raw: unknown, world: WorldApi): string | null {
  if (typeof raw !== 'string') return null
  const norm = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  const asDesk = /^\d+$/.test(norm) ? `desk-${norm}` : norm // models sometimes send just "2"
  if (world.desks.some((d) => d.id === asDesk)) return asDesk
  const agent = world.agents().find((a) => a.id === norm || a.name.toLowerCase() === norm)
  return agent ? agent.id : null
}

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

/** Model output is untrusted: parse and validate against the real world. */
export function parseTurn(raw: string, selfId: string, world: WorldApi): Turn | null {
  let obj: any
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null

  const turn: Turn = { thought: clean(obj.thought, 300), remember: clean(obj.remember, 160) }

  if (obj.action === 'walk_to') {
    const target = resolveId(obj.target, world)
    if (target && target !== selfId) turn.act = { action: 'walk_to', target }
  } else if (obj.action === 'say') {
    const text = clean(obj.text, 140)
    if (text) {
      const to = resolveId(obj.to, world)
      turn.act = { action: 'say', text, to: to && world.getAgent(to) && to !== selfId ? to : undefined }
    }
  }
  return turn.act || turn.thought ? turn : null
}

// ---- The loop (one per agent) ----

export function startAgentLoop(agentId: string, world: WorldApi, startDelayMs = 1000) {
  let warned = false
  const tag = `[${agentId}]`

  const execute = (a: Action) => {
    if (a.action === 'walk_to') {
      const r = world.walkTo(agentId, a.target)
      if (r.ok) {
        world.record(agentId, 'action', `Walked to ${a.target}`)
        console.log(`${tag} walk_to ${a.target}`)
      } else {
        world.record(agentId, 'action', `Tried to walk to ${a.target} but ${r.reason}`)
        console.log(`${tag} walk_to ${a.target} refused: ${r.reason}`)
      }
    } else {
      world.say(agentId, a.text, a.to)
      world.record(agentId, 'action', `Said${a.to ? ` to ${world.getAgent(a.to)?.name}` : ''}: "${a.text}"`)
      console.log(`${tag} say${a.to ? ` -> ${a.to}` : ''}: ${a.text}`)
    }
  }

  const tick = async () => {
    try {
      const me = world.getAgent(agentId)
      // Busy walking: let the body finish before thinking again.
      if (me && me.status !== 'walking') {
        const raw = await askOllama(buildMessages(me, world))
        const turn = parseTurn(raw, agentId, world)
        warned = false
        if (!turn) {
          console.warn(`${tag} ignored invalid model output: ${raw.slice(0, 120)}`)
        } else {
          if (turn.thought) world.record(agentId, 'thought', turn.thought)
          if (turn.remember) world.record(agentId, 'note', turn.remember)
          if (turn.act) execute(turn.act)
        }
      }
    } catch (err) {
      if (!warned) console.warn(`${tag} Ollama unavailable (${(err as Error).message}); will keep retrying`)
      warned = true
    } finally {
      setTimeout(tick, THINK_EVERY_MS) // next turn only after this one finished
    }
  }

  console.log(`Agent loop: ${agentId} via ${MODEL} @ ${OLLAMA_URL}, every ${THINK_EVERY_MS}ms`)
  setTimeout(tick, startDelayMs)
}
