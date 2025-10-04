export class LanguageResolver {
  constructor() {
    this.iso3ToIso2 = {
      ita: 'it',
      eng: 'en',
      spa: 'es',
      fra: 'fr',
      fre: 'fr',
      deu: 'de',
      ger: 'de',
      por: 'pt',
      sun: 'su',
      nya: 'ny'
    };
  }

  normalize(code) {
    if (typeof code !== 'string') {
      return null;
    }
    const normalized = code.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized.length === 3 && this.iso3ToIso2[normalized]) {
      return this.iso3ToIso2[normalized];
    }

    return normalized;
  }
}
