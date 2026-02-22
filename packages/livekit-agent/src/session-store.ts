/**
 * @nexus-aec/livekit-agent - Session Store
 *
 * Centralized session tracking to avoid cross-module cycles.
 */

/**
 * Agent session state
 */
export interface AgentSession {
  /** Unique session ID */
  sessionId: string;
  /** Room name */
  roomName: string;
  /** User participant identity */
  userIdentity: string;
  /** User display name (from JWT, may differ from identity) */
  displayName?: string;
  /** Session start time */
  startedAt: Date;
  /** Whether the agent is currently speaking */
  isSpeaking: boolean;
  /** Whether the session is active */
  isActive: boolean;
}

/**
 * Active sessions tracked by room name
 */
const activeSessions = new Map<string, AgentSession>();

/**
 * Get active session by room name
 */
export function getSession(roomName: string): AgentSession | undefined {
  return activeSessions.get(roomName);
}

/**
 * Get all active sessions
 */
export function getAllSessions(): AgentSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Get active session count
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Track a session as active
 */
export function setSession(session: AgentSession): void {
  activeSessions.set(session.roomName, session);
}

/**
 * Remove a session
 */
export function removeSession(roomName: string): void {
  activeSessions.delete(roomName);
}
