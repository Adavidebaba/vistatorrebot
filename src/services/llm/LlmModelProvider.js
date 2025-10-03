export class LlmModelProvider {
  constructor({ environmentConfig, settingsRepository }) {
    this.environmentConfig = environmentConfig;
    this.settingsRepository = settingsRepository;
    this.settingKey = 'llm_active_model';
  }

  getModelCandidates() {
    const primary = this.getActiveModel();
    const fallback = this.environmentConfig.fallbackModel;
    const candidates = [primary];
    if (fallback && fallback !== primary) {
      candidates.push(fallback);
    }
    return candidates;
  }

  getActiveModel() {
    const stored = this.settingsRepository.getValue(this.settingKey);
    if (stored && this.isAllowed(stored)) {
      return stored;
    }

    const defaultModel = this.environmentConfig.primaryModel || this.environmentConfig.llmModel;
    const model = defaultModel || this.environmentConfig.availableModels[0];
    if (model) {
      this.setActiveModel(model);
      return model;
    }
    throw new Error('No LLM model configured.');
  }

  setActiveModel(modelName) {
    if (!this.isAllowed(modelName)) {
      throw new Error(`Model ${modelName} is not allowed.`);
    }
    this.settingsRepository.setValue(this.settingKey, modelName);
    return modelName;
  }

  getAvailableModels() {
    const configured = this.environmentConfig.availableModels;
    if (configured.length > 0) {
      return configured;
    }
    if (this.environmentConfig.llmModel) {
      return [this.environmentConfig.llmModel];
    }
    return [];
  }

  isAllowed(modelName) {
    return this.getAvailableModels().includes(modelName);
  }
}
