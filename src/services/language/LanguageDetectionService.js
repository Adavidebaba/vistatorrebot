import { franc } from 'franc-min';

export class LanguageDetectionService {
  detect(text) {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText) {
      return { isoCode: null, reliable: false };
    }

    const francCode = franc(normalizedText, { minLength: 3 });
    if (!francCode || francCode === 'und') {
      return { isoCode: null, reliable: false };
    }

    return {
      isoCode: this.normalizeCode(francCode),
      reliable: true
    };
  }

  normalizeText(text) {
    if (typeof text !== 'string') {
      return '';
    }
    return text.trim();
  }

  normalizeCode(code) {
    if (typeof code !== 'string') {
      return null;
    }
    return code.trim().toLowerCase();
  }
}
