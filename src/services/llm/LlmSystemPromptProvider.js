export class LlmSystemPromptProvider {
  constructor({ environmentConfig, fallbackPrompt = '', promptSettingsResolver = null } = {}) {
    this.environmentConfig = environmentConfig;
    this.fallbackPrompt = fallbackPrompt;
    this.promptSettingsResolver = promptSettingsResolver;
  }

  getPrompt() {
    const overridePrompt = this.getOverridePrompt();
    if (overridePrompt) {
      return overridePrompt;
    }

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

  getOverridePrompt() {
    if (!this.promptSettingsResolver) {
      return '';
    }
    const prompt = this.promptSettingsResolver.getSystemPromptOverride();
    return this.normalize(prompt);
  }
}
