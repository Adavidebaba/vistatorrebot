export class AdminConversationExporter {
  buildCsv(messages) {
    const header = 'session_id,started_at,role,content,confidence,created_at';
    const rows = messages.map((message) => this.formatRow(message));
    return [header, ...rows].join('\n');
  }

  formatRow(message) {
    const content = this.escapeCsvField(message.content ?? '');
    const confidence = message.confidence ?? '';
    return [
      this.escapeCsvField(message.session_id),
      this.escapeCsvField(message.started_at),
      this.escapeCsvField(message.role),
      content,
      this.escapeCsvField(confidence),
      this.escapeCsvField(message.created_at)
    ].join(',');
  }

  escapeCsvField(value) {
    const stringValue = String(value ?? '');
    const sanitized = stringValue.replace(/"/g, '""');
    return `"${sanitized}"`;
  }
}
