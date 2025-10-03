export class LlmPromptComposer {
  constructor({ systemPrompt, contextLabel = 'FRAMMENTI_DI_DOCUMENTAZIONE' }) {
    this.systemPrompt = systemPrompt;
    this.contextLabel = contextLabel;
  }

  composeMessages({ contextFragments, conversationMessages = [] }) {
    const contextContent = this.buildContextBlock(contextFragments);
    const conversation = this.buildConversation(conversationMessages);

    return [
      { role: 'system', content: this.systemPrompt },
      { role: 'assistant', content: `${this.contextLabel}\n${contextContent}` },
      ...conversation
    ];
  }

  buildConversation(conversationMessages = []) {
    if (!Array.isArray(conversationMessages) || conversationMessages.length === 0) {
      return [];
    }

    return conversationMessages
      .map(({ role, content }) => {
        const normalizedRole = this.normalizeRole(role);
        const normalizedContent = typeof content === 'string' ? content.trim() : '';

        if (!normalizedRole || !normalizedContent) {
          return null;
        }

        return { role: normalizedRole, content: normalizedContent };
      })
      .filter(Boolean);
  }

  normalizeRole(role) {
    if (typeof role !== 'string') {
      return null;
    }
    const normalized = role.trim().toLowerCase();
    if (normalized === 'user' || normalized === 'assistant' || normalized === 'system') {
      return normalized;
    }
    return null;
  }

  buildContextBlock(contextFragments = []) {
    if (!Array.isArray(contextFragments) || contextFragments.length === 0) {
      return 'NESSUN FRAMMENTO DISPONIBILE';
    }

    const sanitizedFragments = contextFragments
      .map((fragment) => fragment?.content?.trim())
      .filter((content) => Boolean(content));

    if (sanitizedFragments.length === 0) {
      return 'NESSUN FRAMMENTO DISPONIBILE';
    }

    return sanitizedFragments.join('\n---\n');
  }
}
