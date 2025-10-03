export class AdminDashboardPreferences {
  constructor({ settingsRepository, environmentConfig, systemPromptProvider, promptSettingsResolver }) {
    this.settingsRepository = settingsRepository;
    this.environmentConfig = environmentConfig;
    this.systemPromptProvider = systemPromptProvider;
    this.promptSettingsResolver = promptSettingsResolver;
  }

  getDocumentationUrl() {
    const stored = this.normalizeString(
      this.settingsRepository.getSetting('documentation_url')?.value
    );
    if (stored) {
      return stored;
    }

    const envUrl = this.normalizeString(this.environmentConfig?.googleDocUrl);
    return envUrl;
  }

  updateDocumentationUrl(url) {
    this.settingsRepository.saveSetting('documentation_url', this.normalizeString(url));
  }

  getSystemPrompt() {
    const override = this.normalizeMultiline(
      this.promptSettingsResolver?.getSystemPromptOverride?.()
    );
    if (override) {
      return override;
    }

    try {
      const activePrompt = this.systemPromptProvider?.getPrompt();
      return this.normalizeMultiline(activePrompt);
    } catch (error) {
      return '';
    }
  }

  updateSystemPrompt(prompt) {
    this.settingsRepository.saveSetting('system_prompt_override', this.normalizeMultiline(prompt));
  }

  normalizeString(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  normalizeMultiline(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/\r\n/g, '\n').trim();
  }
}
