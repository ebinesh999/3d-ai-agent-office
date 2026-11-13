import type { LogEntry, LogKind } from '../shared/protocol'
import type { Live, Logs, Roster } from './useWorld'

type Props = {
  roster: Roster
  live: Live
  logs: Logs
  selected: string | null
  connected: boolean
  onSelect: (id: string) => void
}

const KIND: Record<LogKind, { label: string; color: string }> = {
  thought: { label: 'thinks', color: '#7a5af8' },
  action: { label: 'does', color: '#2e7d32' },
  heard: { label: 'hears', color: '#b26a00' },
  note: { label: 'remembers', color: '#c2185b' },
}

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function Entry({ e }: { e: LogEntry }) {
  const k = KIND[e.kind]
  return (
    <li style={{ padding: '8px 0', borderBottom: '1px solid #e6e9ee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span style={{ color: k.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
        <span style={{ color: '#8a93a0' }}>{time(e.t)}</span>
      </div>
      <div style={{ fontStyle: e.kind === 'thought' ? 'italic' : 'normal', lineHeight: 1.4 }}>{e.text}</div>
    </li>
  )
}

/** Read-only view of what the server says each agent is thinking, doing and remembering. */
export default function ThoughtPanel({ roster, live, logs, selected, connected, onSelect }: Props) {
  const current = roster.find((r) => r.id === selected)
  // Newest first, so fresh thoughts appear at the top without scroll juggling
  const entries = current ? [...(logs[current.id] ?? [])].reverse() : []

  return (
    <aside
      style={{
        width: 340, maxWidth: '45vw', flex: 'none', display: 'flex', flexDirection: 'column',
        background: '#fff', color: '#1d2430', font: '14px sans-serif', borderLeft: '1px solid #d5dae1',
      }}
    >
      <header style={{ padding: '12px 14px 0' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Agent minds</div>
        <div style={{ fontSize: 12, color: connected ? '#2e7d32' : '#c62828', margin: '2px 0 10px' }}>
          {connected ? 'Connected to server' : 'Connecting to server…'}
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 6 }}>
          {roster.map((r) => {
            const on = r.id === selected
            return (
              <button
                key={r.id}
                role="tab"
                aria-selected={on}
                onClick={() => onSelect(r.id)}
                style={{
                  flex: 1, padding: '6px 4px', cursor: 'pointer', borderRadius: '8px 8px 0 0', font: 'inherit',
                  border: `1px solid ${on ? r.color : '#d5dae1'}`, borderBottom: on ? `3px solid ${r.color}` : undefined,
                  background: on ? '#f5f7fa' : '#fff', fontWeight: on ? 700 : 400,
                }}
              >
                <span style={{ color: r.color }}>●</span> {r.name}
              </button>
            )
          })}
        </div>
      </header>

      {current && (
        <div style={{ padding: '10px 14px', background: '#f5f7fa', borderBottom: '1px solid #d5dae1' }}>
          <div style={{ fontSize: 12, color: '#5b6573' }}>{current.role}</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            Status: <b>{live[current.id]?.status ?? '—'}</b>
          </div>
        </div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: '0 14px', overflowY: 'auto', flex: 1 }}>
        {entries.length === 0 && <li style={{ padding: '14px 0', color: '#8a93a0' }}>Nothing yet. Waiting for the agent to think…</li>}
        {entries.map((e) => (
          <Entry key={e.id} e={e} />
        ))}
      </ul>

      <footer style={{ padding: '8px 14px', fontSize: 12, color: '#8a93a0', borderTop: '1px solid #d5dae1' }}>
        Click a character, then a desk, to send them there.
      </footer>
    </aside>
  )
}
