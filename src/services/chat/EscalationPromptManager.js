import { Logger } from '../../utils/Logger.js';

export class EscalationPromptManager {
  constructor({ localizationService, languageResolver, logger = Logger.for('EscalationPromptManager') }) {
    this.localizationService = localizationService;
    this.languageResolver = languageResolver;
    this.logger = logger;
  }

  async buildPrompt({ llmDecision, languageCode }) {
    if (!this.shouldDisplayPrompt(llmDecision)) {
      return { shouldDisplay: false };
    }

    const normalizedLanguage = this.languageResolver.normalize(languageCode);
    const metadata = llmDecision?.metadata?.escalation_prompt || {};
    const fallback = await this.resolvePromptFallback(normalizedLanguage);
    const buttonLabels = this.selectLocalizedValue({
      custom: metadata.button_labels,
      fallback: fallback.buttonLabels,
      languageCode: normalizedLanguage
    });
    const confirmationMessages = this.selectLocalizedValue({
      custom: metadata.confirmation_messages,
      fallback: fallback.confirmationMessages,
      languageCode: normalizedLanguage
    });

    return {
      shouldDisplay: true,
      buttonLabels,
      confirmationMessages
    };
  }

  async ensurePromptVisible({ languageCode, currentPrompt }) {
    if (currentPrompt?.shouldDisplay) {
      return currentPrompt;
    }
    const fallback = await this.resolvePromptFallback(languageCode);
    return {
      shouldDisplay: true,
      buttonLabels: fallback.buttonLabels,
      confirmationMessages: fallback.confirmationMessages
    };
  }

  shouldDisplayPrompt(llmDecision) {
    if (!llmDecision) {
      return false;
    }
    if (llmDecision.show_escalation_prompt === true) {
      return true;
    }
    const explicit = llmDecision?.metadata?.show_escalation_prompt;
    return explicit === true;
  }

  async resolvePromptFallback(languageCode) {
    const defaultFallback = {
      buttonLabels: { en: 'Notify the manager' },
      confirmationMessages: { en: 'Yes, please notify the manager for me.' }
    };
    if (!this.localizationService) {
      return defaultFallback;
    }
    try {
      const localized = await this.localizationService.buildPromptFallback(
        this.languageResolver.normalize(languageCode)
      );
      return localized || defaultFallback;
    } catch (error) {
      this.logger.error('Prompt localization failed, using default strings', error);
      return defaultFallback;
    }
  }

  selectLocalizedValue({ custom, fallback, languageCode }) {
    const normalizedCustom = this.normalizeRecord(custom);
    const source = Object.keys(normalizedCustom).length > 0 ? normalizedCustom : fallback;

    if (languageCode && source[languageCode]) {
      return { [languageCode]: source[languageCode] };
    }

    return source;
  }

  normalizeRecord(record) {
    if (!record || typeof record !== 'object') {
      return {};
    }

    return Object.entries(record).reduce((accumulator, [key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        const normalizedKey = this.languageResolver.normalize(key) || key;
        accumulator[normalizedKey] = value.trim();
      }
      return accumulator;
    }, {});
  }
}
