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

  upsertStatus({ sessionId, reason, status, managerMessage = '', requiresContact = false }) {
    const now = new Date().toISOString();
    const existing = this.getBySession(sessionId);
    const sanitizedMessage = typeof managerMessage === 'string' ? managerMessage.trim() : '';
    const requiresContactFlag = requiresContact ? 1 : 0;
    if (existing) {
      this.database.execute(
        `UPDATE escalation_contacts
         SET status = @status,
             reason = @reason,
             manager_message = CASE WHEN @manager_message = '' THEN manager_message ELSE @manager_message END,
             requires_contact = @requires_contact,
             updated_at = @updated_at
         WHERE session_id = @session_id`,
        {
          session_id: sessionId,
          status,
          reason,
          manager_message: sanitizedMessage,
          requires_contact: requiresContactFlag,
          updated_at: now
        }
      );
      return;
    }

    this.database.execute(
      `INSERT INTO escalation_contacts (session_id, status, reason, contact_info, manager_message, requires_contact, created_at, updated_at)
       VALUES (@session_id, @status, @reason, '', @manager_message, @requires_contact, @created_at, @updated_at)`,
      {
        session_id: sessionId,
        status,
        reason,
        manager_message: sanitizedMessage,
        requires_contact: requiresContactFlag,
        created_at: now,
        updated_at: now
      }
    );
  }

  markAwaitingConfirmation({ sessionId, reason, managerMessage = '', requiresContact = false }) {
    this.upsertStatus({
      sessionId,
      reason,
      status: 'awaiting_confirmation',
      managerMessage,
      requiresContact
    });
  }

  markPending({ sessionId, reason, managerMessage = '', requiresContact = false }) {
    this.upsertStatus({
      sessionId,
      reason,
      status: 'pending',
      managerMessage,
      requiresContact
    });
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
           requires_contact = 0,
           updated_at = @updated_at
       WHERE session_id = @session_id`,
      {
        session_id: sessionId,
        contact_info: sanitized,
        updated_at: now
      }
    );
  }

  storeManagerMessage({ sessionId, managerMessage }) {
    const sanitized = typeof managerMessage === 'string' ? managerMessage.trim() : '';
    this.database.execute(
      `UPDATE escalation_contacts
       SET manager_message = @manager_message,
           updated_at = @updated_at
       WHERE session_id = @session_id`,
      {
        session_id: sessionId,
        manager_message: sanitized,
        updated_at: new Date().toISOString()
      }
    );
  }

  getManagerMessage(sessionId) {
    const record = this.getBySession(sessionId);
    return record?.manager_message || '';
  }

  requiresContact(sessionId) {
    const record = this.getBySession(sessionId);
    return Boolean(record?.requires_contact);
  }

  delete(sessionId) {
    this.database.execute(
      'DELETE FROM escalation_contacts WHERE session_id = @session_id',
      { session_id: sessionId }
    );
  }
}
