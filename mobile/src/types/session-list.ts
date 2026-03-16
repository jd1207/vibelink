import type { SessionType, Session } from '../store/sessions';

export interface RecentMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  projectName: string;
  lastActivity: string;
  model: string | null;
  name: string | null;
  gitBranch: string | null;
  alive: boolean;
  recentMessages: RecentMessage[];
}

export interface DisplaySession {
  key: string;
  sessionType: SessionType;
  projectName: string;
  projectPath: string;
  lastActivity: string;
  lastMessage: string | null;
  gitBranch: string | null;
  claudeSessionId?: string;
  vibelinkSessionId?: string;
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getLastMessageText(session: ClaudeSession): string | null {
  const lastUserMsg = [...session.recentMessages]
    .reverse()
    .find((m) => m.role === 'user');
  return lastUserMsg?.text ?? null;
}

export function classifySessions(
  claudeSessions: ClaudeSession[],
  vlSessionValues: Session[],
): { activeSessions: DisplaySession[]; idleSessions: DisplaySession[] } {
  const vlSessionPaths = new Set(vlSessionValues.map((vl) => vl.projectPath));

  const terminalSessions: DisplaySession[] = claudeSessions
    .filter((cs) => cs.alive && !vlSessionPaths.has(cs.projectPath))
    .map((cs) => ({
      key: `terminal-${cs.sessionId}`,
      sessionType: 'terminal' as SessionType,
      projectName: cs.name || cs.projectName,
      projectPath: cs.projectPath,
      lastActivity: cs.lastActivity,
      lastMessage: getLastMessageText(cs),
      gitBranch: cs.gitBranch,
      claudeSessionId: cs.sessionId,
    }));

  const vibelinkDisplaySessions: DisplaySession[] = vlSessionValues.map((vl) => ({
    key: `vibelink-${vl.id}`,
    sessionType: 'vibelink' as SessionType,
    projectName: vl.projectName,
    projectPath: vl.projectPath,
    lastActivity: vl.createdAt,
    lastMessage: vl.lastMessage ?? null,
    gitBranch: vl.gitBranch ?? null,
    vibelinkSessionId: vl.id,
  }));

  const activeSessions = [...terminalSessions, ...vibelinkDisplaySessions].sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );

  const idleSessions: DisplaySession[] = claudeSessions
    .filter((cs) => !cs.alive)
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    .slice(0, 20)
    .map((cs) => ({
      key: `idle-${cs.sessionId}`,
      sessionType: 'idle' as SessionType,
      projectName: cs.name || cs.projectName,
      projectPath: cs.projectPath,
      lastActivity: cs.lastActivity,
      lastMessage: getLastMessageText(cs),
      gitBranch: cs.gitBranch,
      claudeSessionId: cs.sessionId,
    }));

  return { activeSessions, idleSessions };
}
