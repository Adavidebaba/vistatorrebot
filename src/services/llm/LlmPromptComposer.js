export class LlmPromptComposer {
  constructor({
    systemPrompt,
    systemPromptProvider = null,
    contextLabel = 'FRAMMENTI_DI_DOCUMENTAZIONE'
  }) {
    this.staticSystemPrompt = this.normalizeSystemPrompt(systemPrompt);
    this.systemPromptProvider = systemPromptProvider;
    this.contextLabel = contextLabel;
  }

  composeMessages({ contextFragments, conversationMessages = [] }) {
    const resolvedPrompt = this.resolveSystemPrompt();
    const contextContent = this.buildContextBlock(contextFragments);
    const conversation = this.buildConversation(conversationMessages);

    return [
      { role: 'system', content: resolvedPrompt },
      { role: 'assistant', content: `${this.contextLabel}\n${contextContent}` },
      ...conversation
    ];
  }

  resolveSystemPrompt() {
    const providerPrompt = this.systemPromptProvider?.getPrompt?.();
    const normalizedProviderPrompt = this.normalizeSystemPrompt(providerPrompt);
    if (normalizedProviderPrompt) {
      return normalizedProviderPrompt;
    }
    return this.staticSystemPrompt;
  }

  normalizeSystemPrompt(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/\r\n/g, '\n').trim();
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
