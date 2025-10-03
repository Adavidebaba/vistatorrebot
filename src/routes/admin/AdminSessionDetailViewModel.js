export class AdminSessionDetailViewModel {
  constructor({ session, messages }) {
    this.session = session;
    this.messages = messages;
  }

  get sessionInfo() {
    return {
      id: this.session.id,
      startedAt: this.session.started_at,
      lastSeenAt: this.session.last_seen_at,
      language: this.session.language,
      escalated: Boolean(this.session.escalated)
    };
  }

  get messageItems() {
    return this.messages.map((message) => ({
      role: message.role,
      createdAt: message.created_at,
      content: message.content ?? ''
    }));
  }
}
