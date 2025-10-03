import OpenAI from 'openai';

export class LlmTranslationService {
  constructor({ environmentConfig, openAiClient, model }) {
    this.environmentConfig = environmentConfig;
    this.client =
      openAiClient || new OpenAI({ apiKey: this.environmentConfig.llmApiKey });
    this.model = model || this.environmentConfig.llmModel;
  }

  async translate({ text, targetLanguage }) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return '';
    }
    const normalizedLanguage = this.normalizeLanguageCode(targetLanguage);
    if (!normalizedLanguage || normalizedLanguage === 'en') {
      return text;
    }

    const messages = [
      {
        role: 'system',
        content: `You translate short assistant messages. Translate the user text into the language represented by the ISO 639-1 code provided. Reply with the translation only.`
      },
      {
        role: 'user',
        content: `ISO 639-1 code: ${normalizedLanguage}\nText:\n${text}`
      }
    ];

    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: messages,
        max_output_tokens: 200
      });
      const translated = response.output?.[0]?.content?.[0]?.text || response.output_text;
      return typeof translated === 'string' && translated.trim().length > 0
        ? translated.trim()
        : text;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Translation failed, falling back to original text', error);
      return text;
    }
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
