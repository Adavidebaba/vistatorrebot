import { v4 as uuid } from 'uuid';

export class SessionRepository {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  getOrCreateSession(sessionId) {
    if (sessionId) {
      const existing = this.database.queryOne(
        'SELECT * FROM sessions WHERE id = @id',
        { id: sessionId }
      );
      if (existing) {
        return existing;
      }
    }

    const newSession = {
      id: uuid(),
      started_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      language: null,
      escalated: 0
    };

    this.database.execute(
      `INSERT INTO sessions (id, started_at, last_seen_at, language, escalated)
       VALUES (@id, @started_at, @last_seen_at, @language, @escalated)`,
      newSession
    );

    return newSession;
  }

  updateLastSeen(sessionId, language) {
    this.database.execute(
      `UPDATE sessions
       SET last_seen_at = @last_seen_at,
           language = COALESCE(@language, language)
       WHERE id = @id`,
      {
        id: sessionId,
        last_seen_at: new Date().toISOString(),
        language
      }
    );
  }

  markEscalated(sessionId) {
    this.database.execute(
      'UPDATE sessions SET escalated = 1 WHERE id = @id',
      { id: sessionId }
    );
  }

  listSessions({ days = 7 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return this.database.query(
      `SELECT * FROM sessions WHERE started_at >= @cutoff ORDER BY last_seen_at DESC`,
      { cutoff }
    );
  }

  getSessionWithMessages(sessionId) {
    const session = this.database.queryOne(
      'SELECT * FROM sessions WHERE id = @id',
      { id: sessionId }
    );
    if (!session) {
      return null;
    }
    const messages = this.database.query(
      `SELECT * FROM messages WHERE session_id = @session_id ORDER BY created_at ASC`,
      { session_id: sessionId }
    );
    return { session, messages };
  }
}
