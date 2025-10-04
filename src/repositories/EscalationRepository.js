export class EscalationRepository {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  recordEscalation({ sessionId, type, reason, details = '' }) {
    this.database.execute(
      `INSERT INTO escalations (session_id, type, reason, details, email_sent_at)
       VALUES (@session_id, @type, @reason, @details, @email_sent_at)`,
      {
        session_id: sessionId,
        type,
        reason,
        details,
        email_sent_at: new Date().toISOString()
      }
    );
  }

  listEscalations() {
    return this.database.query(
      'SELECT * FROM escalations ORDER BY email_sent_at DESC'
    );
  }

  deleteBySession(sessionId) {
    this.database.execute(
      'DELETE FROM escalations WHERE session_id = @session_id',
      { session_id: sessionId }
    );
  }
}
