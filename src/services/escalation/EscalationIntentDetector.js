import { Logger } from '../../utils/Logger.js';

export class EscalationIntentDetector {
  constructor({ translationService }) {
    this.translationService = translationService;
    this.logger = Logger.for('EscalationIntentDetector');
  }

  async analyzeAssistantMessage({ answer }) {
    const english = await this.toEnglish(answer);
    if (!english) {
      return { promptConfirmation: false, escalateImmediately: false };
    }

    const normalized = english.toLowerCase();
    const mentionsManager = this.containsAny(normalized, [
      'notify the manager',
      'contact the manager',
      'alert the manager',
      'inform the manager',
      'reach the manager',
      'call the host',
      'contact the host'
    ]);

    if (!mentionsManager) {
      return { promptConfirmation: false, escalateImmediately: false, reasonHint: null };
    }

    const asksConfirmation = this.containsAny(normalized, [
      'do you want',
      'would you like',
      'shall i',
      'should i',
      'let me know',
      'can i alert',
      'confirm'
    ]) || normalized.includes('?');

    const statesAction = this.containsAny(normalized, [
      'i will notify the manager',
      'i am notifying the manager',
      'i have notified the manager',
      'i am alerting the manager',
      'i have alerted the manager'
    ]);

    const urgentKeywords = ['gas', 'leak', 'emergency', 'smoke', 'fire', 'danger'];
    const reasonHint = this.containsAny(normalized, urgentKeywords) ? 'urgent' : null;

    const result = {
      promptConfirmation: asksConfirmation && !statesAction,
      escalateImmediately: statesAction && !asksConfirmation,
      reasonHint
    };
    this.logger.debug('Assistant message analysis', { english, result });
    return result;
  }

  async analyzeUserConfirmation({ message }) {
    const english = await this.toEnglish(message);
    if (!english) {
      return 'unknown';
    }
    const normalized = english.toLowerCase();
    if (this.containsAny(normalized, ['yes', 'sure', 'please', 'ok', 'notify'])) {
      this.logger.debug('User confirmation detected as affirmative', { english });
      return 'affirmative';
    }
    if (this.containsAny(normalized, ['no', 'not now', 'later', 'cancel', "don't"])) {
      this.logger.debug('User confirmation detected as negative', { english });
      return 'negative';
    }
    this.logger.debug('User confirmation ambiguous', { english });
    return 'unknown';
  }

  async toEnglish(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    if (!this.translationService) {
      return text;
    }
    const translation = await this.translationService.translate({
      text,
      targetLanguage: 'en'
    });
    this.logger.debug('Translated text to English', { original: text, translation });
    return translation || text;
  }

  containsAny(text, needleList) {
    return needleList.some((needle) => text.includes(needle));
  }
}
