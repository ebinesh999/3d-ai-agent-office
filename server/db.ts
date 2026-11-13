import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LogEntry, LogKind } from '../shared/protocol'

const DB_PATH = process.env.AGENT_DB ?? fileURLToPath(new URL('./data/memory.db', import.meta.url))
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS entries (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    kind     TEXT NOT NULL,
    text     TEXT NOT NULL,
    t        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entries_agent ON entries (agent_id, kind, id);
`)

type Row = { id: number; agent_id: string; kind: LogKind; text: string; t: number }
const toEntry = (r: Row): LogEntry => ({ id: r.id, agentId: r.agent_id, kind: r.kind, text: r.text, t: r.t })

const insert = db.prepare('INSERT INTO entries (agent_id, kind, text, t) VALUES (?, ?, ?, ?)')
const selectRecent = db.prepare('SELECT * FROM entries WHERE agent_id = ? AND kind = ? ORDER BY id DESC LIMIT ?')
const selectNote = db.prepare("SELECT id FROM entries WHERE agent_id = ? AND kind = 'note' AND text = ?")

export function addEntry(agentId: string, kind: LogKind, text: string): LogEntry {
  const t = Date.now()
  const res = insert.run(agentId, kind, text, t)
  return { id: Number(res.lastInsertRowid), agentId, kind, text, t }
}

export function hasNote(agentId: string, text: string): boolean {
  return selectNote.get(agentId, text) !== undefined
}

/** Most recent entries of the given kinds, oldest first. */
export function recent(agentId: string, kinds: LogKind[], limit: number): LogEntry[] {
  const rows = kinds.flatMap((k) => selectRecent.all(agentId, k, limit) as Row[])
  return rows
    .map(toEntry)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .reverse()
}

/** What a newly connected browser needs to fill the thought panel. */
export function recentForClient(agentIds: string[], perAgent = 40): LogEntry[] {
  return agentIds.flatMap((id) => recent(id, ['thought', 'action', 'heard', 'note'], perAgent))
}
