export class MessageRepository {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  addMessage({ sessionId, role, content, confidence = null }) {
    this.database.execute(
      `INSERT INTO messages (session_id, role, content, confidence, created_at)
       VALUES (@session_id, @role, @content, @confidence, @created_at)`,
      {
        session_id: sessionId,
        role,
        content,
        confidence,
        created_at: new Date().toISOString()
      }
    );
  }

  getRecentMessages(sessionId, limit = 6) {
    return this.database.query(
      `SELECT * FROM messages
       WHERE session_id = @session_id
       ORDER BY created_at DESC
       LIMIT @limit`,
      { session_id: sessionId, limit }
    );
  }

  listMessagesForSession(sessionId) {
    return this.database.query(
      `SELECT * FROM messages
       WHERE session_id = @session_id
       ORDER BY created_at ASC`,
      { session_id: sessionId }
    );
  }

  listAllMessages() {
    return this.database.query(
      `SELECT sessions.id AS session_id, sessions.started_at, messages.role, messages.content, messages.confidence, messages.created_at
       FROM messages
       JOIN sessions ON sessions.id = messages.session_id
       ORDER BY messages.created_at ASC`
    );
  }
}
