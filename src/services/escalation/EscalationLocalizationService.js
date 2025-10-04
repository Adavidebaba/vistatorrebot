import { Logger } from '../../utils/Logger.js';

export class EscalationLocalizationService {
  constructor({ translationService }) {
    this.translationService = translationService;
    this.cache = new Map();
    this.logger = Logger.for('EscalationLocalization');
  }

  async buildPromptFallback(languageCode) {
    const normalized = this.normalizeLanguageCode(languageCode) || 'en';
    if (normalized === 'en') {
      this.logger.debug('Using default English prompt fallback');
      return {
        buttonLabels: { en: 'Notify the manager' },
        confirmationMessages: { en: 'Yes, please notify the manager for me.' }
      };
    }

    const buttonLabel = await this.getLocalizedString({
      key: 'prompt_button',
      baseText: 'Notify the manager',
      languageCode: normalized
    });
    const confirmationMessage = await this.getLocalizedString({
      key: 'prompt_confirmation',
      baseText: 'Yes, please notify the manager for me.',
      languageCode: normalized
    });

    return {
      buttonLabels: { [normalized]: buttonLabel },
      confirmationMessages: { [normalized]: confirmationMessage }
    };
  }

  async buildContactRequestMessage(languageCode) {
    return this.getLocalizedString({
      key: 'contact_request',
      baseText: 'Before I alert the manager, please let me know how they can reach you (phone, email, etc.).',
      languageCode: this.normalizeLanguageCode(languageCode)
    });
  }

  async buildContactConfirmationMessage(languageCode) {
    return this.getLocalizedString({
      key: 'contact_confirmation',
      baseText: 'Thanks, I have notified the manager and they will reach out to you shortly.',
      languageCode: this.normalizeLanguageCode(languageCode)
    });
  }

  async buildContactDeclinedMessage(languageCode) {
    return this.getLocalizedString({
      key: 'contact_declined',
      baseText: 'Understood, I will stay available if you need anything else.',
      languageCode: this.normalizeLanguageCode(languageCode)
    });
  }

  async getLocalizedString({ key, baseText, languageCode }) {
    const normalizedLanguage = languageCode || 'en';
    if (normalizedLanguage === 'en' || !this.translationService) {
      return baseText;
    }

    const cacheKey = `${key}:${normalizedLanguage}`;
    if (this.cache.has(cacheKey)) {
      this.logger.debug('Localization cache hit', { cacheKey });
      return this.cache.get(cacheKey);
    }

    const translation = await this.translationService.translate({
      text: baseText,
      targetLanguage: normalizedLanguage
    });
    this.logger.debug('Localized string generated', {
      cacheKey,
      length: translation ? translation.length : null
    });
    this.cache.set(cacheKey, translation);
    return translation;
  }

  normalizeLanguageCode(code) {
    if (typeof code !== 'string') {
      return null;
    }
    const normalized = code.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const iso3ToIso2 = {
      ita: 'it',
      eng: 'en',
      spa: 'es',
      fra: 'fr',
      fre: 'fr',
      deu: 'de',
      ger: 'de',
      por: 'pt'
    };

    if (normalized.length === 3 && iso3ToIso2[normalized]) {
      return iso3ToIso2[normalized];
    }

    return normalized;
  }
}
