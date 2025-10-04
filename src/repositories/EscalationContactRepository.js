export class EscalationContactRepository {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  getBySession(sessionId) {
    return this.database.queryOne(
      'SELECT * FROM escalation_contacts WHERE session_id = @session_id',
      { session_id: sessionId }
    );
  }

  upsertStatus({ sessionId, reason, status }) {
    const now = new Date().toISOString();
    const existing = this.getBySession(sessionId);
    if (existing) {
      this.database.execute(
        `UPDATE escalation_contacts
         SET status = @status,
             reason = @reason,
             updated_at = @updated_at
         WHERE session_id = @session_id`,
        {
          session_id: sessionId,
          status,
          reason,
          updated_at: now
        }
      );
      return;
    }

    this.database.execute(
      `INSERT INTO escalation_contacts (session_id, status, reason, contact_info, created_at, updated_at)
       VALUES (@session_id, @status, @reason, '', @created_at, @updated_at)`,
      {
        session_id: sessionId,
        status,
        reason,
        created_at: now,
        updated_at: now
      }
    );
  }

  markAwaitingConfirmation({ sessionId, reason }) {
    this.upsertStatus({ sessionId, reason, status: 'awaiting_confirmation' });
  }

  markPending({ sessionId, reason }) {
    this.upsertStatus({ sessionId, reason, status: 'pending' });
  }

  storeContact({ sessionId, contactInfo }) {
    const sanitized = typeof contactInfo === 'string' ? contactInfo.trim() : '';
    if (!sanitized) {
      return;
    }
    const now = new Date().toISOString();
    this.database.execute(
      `UPDATE escalation_contacts
       SET status = 'ready',
           contact_info = @contact_info,
           updated_at = @updated_at
       WHERE session_id = @session_id`,
      {
        session_id: sessionId,
        contact_info: sanitized,
        updated_at: now
      }
    );
  }

  delete(sessionId) {
    this.database.execute(
      'DELETE FROM escalation_contacts WHERE session_id = @session_id',
      { session_id: sessionId }
    );
  }
}
