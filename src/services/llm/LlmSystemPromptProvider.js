export class LlmSystemPromptProvider {
  constructor({ environmentConfig, fallbackPrompt = '' } = {}) {
    this.environmentConfig = environmentConfig;
    this.fallbackPrompt = fallbackPrompt;
  }

  getPrompt() {
    const rawPrompt = this.environmentConfig?.llmSystemPrompt;
    const normalizedPrompt = this.normalize(rawPrompt);
    if (normalizedPrompt) {
      return normalizedPrompt;
    }

    const normalizedFallback = this.normalize(this.fallbackPrompt);
    if (normalizedFallback) {
      return normalizedFallback;
    }

    throw new Error(
      'LLM system prompt is not configured. Set LLM_SYSTEM_PROMPT in the environment.'
    );
  }

  normalize(value) {
    if (!value) {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.replace(/\\n/g, '\n');
  }
}
