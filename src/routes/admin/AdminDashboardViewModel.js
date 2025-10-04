export class AdminDashboardViewModel {
  constructor({
    sessions,
    selectedDays,
    feedbackMessage = null,
    modelOptions = [],
    documentationUrl = '',
    systemPrompt = '',
    adminEmail = ''
  }) {
    this.sessions = sessions;
    this.selectedDays = selectedDays;
    this.feedbackMessage = feedbackMessage;
    this.modelOptions = modelOptions;
    this.documentationUrl = documentationUrl;
    this.systemPrompt = systemPrompt;
    this.adminEmail = adminEmail;
  }

  get hasSessions() {
    return this.sessions.length > 0;
  }

  get tableRows() {
    return this.sessions.map((session) => ({
      id: session.id,
      startedAt: session.started_at,
      lastSeenAt: session.last_seen_at,
      language: session.language,
      escalated: Boolean(session.escalated)
    }));
  }

  get daysOptions() {
    const allowed = [7, 30];
    return allowed.map((value) => ({
      value,
      label: `Ultimi ${value}`,
      selected: value === this.selectedDays
    }));
  }

  get hasFeedback() {
    return Boolean(this.feedbackMessage);
  }

  get hasModelOptions() {
    return this.modelOptions.length > 0;
  }
}
