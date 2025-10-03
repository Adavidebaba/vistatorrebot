export class LlmPromptSettingsResolver {
  constructor({ settingsRepository }) {
    this.settingsRepository = settingsRepository;
  }

  getSystemPromptOverride() {
    const record = this.settingsRepository.getSetting('system_prompt_override');
    if (record && typeof record.value === 'string') {
      return record.value;
    }
    return '';
  }
}
