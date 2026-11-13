import { useEffect, useRef, useState } from 'react'
import type { AgentState, ClientMessage, DeskInfo, LogEntry, ServerMessage } from '../shared/protocol'

const URL = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:8080`
const KEEP_LOGS = 80

export type Layout = { desks: DeskInfo[]; floor: number }
export type Roster = { id: string; name: string; color: string; role: string }[]
export type Live = Record<string, { status: string; speech: string | null }>
export type Logs = Record<string, LogEntry[]>

const groupLogs = (entries: LogEntry[]): Logs => {
  const out: Logs = {}
  for (const e of entries) (out[e.agentId] ??= []).push(e)
  for (const id in out) out[id] = out[id].sort((a, b) => a.id - b.id).slice(-KEEP_LOGS)
  return out
}

/** Mirrors server state. The client holds no simulation of its own. */
export function useWorld() {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [roster, setRoster] = useState<Roster>([])
  const [connected, setConnected] = useState(false)
  // Status + speech change rarely, so they live in React state (drives bubbles / panel).
  const [live, setLive] = useState<Live>({})
  const [logs, setLogs] = useState<Logs>({})
  // Positions arrive at ~20Hz and are read per-frame, so they stay out of React.
  const agents = useRef<Map<string, AgentState>>(new Map())
  const socket = useRef<WebSocket | null>(null)

  useEffect(() => {
    let closed = false
    let retry: number | undefined

    const connect = () => {
      const ws = new WebSocket(URL)
      socket.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = window.setTimeout(connect, 1000)
      }
      ws.onmessage = (ev) => {
        const msg: ServerMessage = JSON.parse(ev.data)

        if (msg.type === 'log') {
          const e = msg.entry
          setLogs((prev) => ({ ...prev, [e.agentId]: [...(prev[e.agentId] ?? []), e].slice(-KEEP_LOGS) }))
          return
        }

        if (msg.type === 'init') {
          setLayout({ desks: msg.desks, floor: msg.floor })
          setRoster(msg.agents.map(({ id, name, color, role }) => ({ id, name, color, role })))
          setLogs(groupLogs(msg.logs))
        }
        agents.current = new Map(msg.agents.map((a) => [a.id, a]))
        setLive((prev) => {
          const same = msg.agents.every((a) => prev[a.id]?.status === a.status && prev[a.id]?.speech === a.speech)
          return same
            ? prev
            : Object.fromEntries(msg.agents.map((a) => [a.id, { status: a.status, speech: a.speech }]))
        })
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      socket.current?.close()
    }
  }, [])

  const moveTo = (agentId: string, deskId: string) => {
    const msg: ClientMessage = { type: 'moveTo', agentId, deskId }
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg))
  }

  return { layout, roster, connected, live, logs, agents, moveTo }
}
