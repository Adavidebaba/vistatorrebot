export class LlmPromptComposer {
  constructor({ systemPrompt, contextLabel = 'FRAMMENTI_DI_DOCUMENTAZIONE' }) {
    this.systemPrompt = systemPrompt;
    this.contextLabel = contextLabel;
  }

  composeMessages({ contextFragments, userMessage }) {
    const contextContent = this.buildContextBlock(contextFragments);

    return [
      { role: 'system', content: this.systemPrompt },
      { role: 'assistant', content: `${this.contextLabel}\n${contextContent}` },
      { role: 'user', content: userMessage }
    ];
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
