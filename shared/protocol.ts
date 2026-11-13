// Messages shared by server and frontend.

export type AgentStatus = 'idle' | 'walking' | 'working'

export type DeskInfo = {
  id: string
  position: [number, number, number]
  rotationY: number
}

export type AgentState = {
  id: string
  name: string
  role: string
  color: string
  speech: string | null // current speech bubble, cleared by the server after a few seconds
  speechTo: string | null // agent id being addressed, if any
  x: number
  z: number
  heading: number // radians, rotation about Y
  status: AgentStatus
  deskId: string | null // desk the agent is heading to / working at
}

/**
 * One row of an agent's persistent log.
 *  thought: private reasoning     action: something the agent did
 *  heard:   something it overheard  note:  a fact it chose to remember long-term
 */
export type LogKind = 'thought' | 'action' | 'heard' | 'note'
export type LogEntry = { id: number; agentId: string; kind: LogKind; text: string; t: number }

export type ServerMessage =
  | { type: 'init'; desks: DeskInfo[]; floor: number; agents: AgentState[]; logs: LogEntry[] }
  | { type: 'state'; t: number; agents: AgentState[] }
  | { type: 'log'; entry: LogEntry }

export type ClientMessage = { type: 'moveTo'; agentId: string; deskId: string }
