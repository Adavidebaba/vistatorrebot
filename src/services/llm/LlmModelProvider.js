export class LlmModelProvider {
  constructor({ environmentConfig, settingsRepository }) {
    this.environmentConfig = environmentConfig;
    this.settingsRepository = settingsRepository;
    this.settingKey = 'llm_active_model';
  }

  getModelCandidates() {
    const active = this.getActiveModel();
    const candidates = [];

    if (active) {
      candidates.push(active);
    }

    for (const combo of this.environmentConfig.modelConfigurations) {
      if (!combo) {
        continue;
      }
      if (active && combo.provider === active.provider && combo.model === active.model) {
        continue;
      }
      candidates.push({ provider: combo.provider, model: combo.model });
    }

    return candidates;
  }

  getActiveModel() {
    const stored = this.settingsRepository.getValue(this.settingKey);
    const parsed = this.parseSelection(stored);
    if (parsed && this.isAllowedCombination(parsed)) {
      return parsed;
    }

    const [first] = this.getAvailableModels();
    if (first) {
      this.setActiveModel(first);
      return first;
    }

    const fallback = this.environmentConfig.llmModel;
    if (fallback) {
      return { provider: 'openai', model: fallback };
    }

    throw new Error('No LLM model configured.');
  }

  setActiveModel(selection) {
    const parsed =
      typeof selection === 'string' ? this.parseSelection(selection) : selection;
    if (!parsed || !this.isAllowedCombination(parsed)) {
      throw new Error('Model selection is not allowed.');
    }
    this.settingsRepository.setValue(this.settingKey, this.buildSelectionValue(parsed));
    return parsed;
  }

  getAvailableModels() {
    return this.environmentConfig.modelConfigurations.map((item) => ({
      provider: item.provider,
      model: item.model,
      label: this.buildLabel(item)
    }));
  }

  isAllowedCombination(selection) {
    return this.environmentConfig.modelConfigurations.some(
      (item) => item.provider === selection.provider && item.model === selection.model
    );
  }

  parseSelection(value) {
    if (!value) {
      return null;
    }
    if (typeof value === 'object' && value.provider && value.model) {
      return { provider: value.provider, model: value.model };
    }
    const stringValue = String(value);
    if (!stringValue) {
      return null;
    }
    if (stringValue.includes(':')) {
      const [provider, ...modelParts] = stringValue.split(':');
      const model = modelParts.join(':');
      if (provider && model) {
        return { provider, model };
      }
    }
    return { provider: 'openai', model: stringValue };
  }

  buildSelectionValue({ provider, model }) {
    return `${provider}:${model}`;
  }

  buildLabel({ provider, model }) {
    const providerName = provider === 'xai' ? 'xAI' : 'OpenAI';
    return `${providerName} · ${model}`;
  }
}
