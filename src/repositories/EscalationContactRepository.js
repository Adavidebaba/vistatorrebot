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

  upsertPending({ sessionId, reason }) {
    const now = new Date().toISOString();
    const existing = this.getBySession(sessionId);
    if (existing) {
      this.database.execute(
        `UPDATE escalation_contacts
         SET status = 'pending',
             reason = @reason,
             updated_at = @updated_at
         WHERE session_id = @session_id`,
        {
          session_id: sessionId,
          reason,
          updated_at: now
        }
      );
      return;
    }

    this.database.execute(
      `INSERT INTO escalation_contacts (session_id, status, reason, contact_info, created_at, updated_at)
       VALUES (@session_id, 'pending', @reason, '', @created_at, @updated_at)`,
      {
        session_id: sessionId,
        reason,
        created_at: now,
        updated_at: now
      }
    );
  }

  storeContact({ sessionId, contactInfo }) {
    const now = new Date().toISOString();
    this.database.execute(
      `UPDATE escalation_contacts
       SET status = 'ready',
           contact_info = @contact_info,
           updated_at = @updated_at
       WHERE session_id = @session_id`,
      {
        session_id: sessionId,
        contact_info: contactInfo,
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
