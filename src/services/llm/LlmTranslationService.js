import OpenAI from 'openai';

import { Logger } from '../../utils/Logger.js';

export class LlmTranslationService {
  constructor({ environmentConfig, modelProvider, openAiClient }) {
    this.environmentConfig = environmentConfig;
    this.modelProvider = modelProvider;
    this.openAiClient = openAiClient || null;
    this.logger = Logger.for('LlmTranslationService');
  }

  async translate({ text, targetLanguage }) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return '';
    }
    const normalizedLanguage = this.normalizeLanguageCode(targetLanguage);
    if (!normalizedLanguage) {
      return text;
    }

    const { provider, model } = this.resolveActiveModel();
    if (!provider || !model) {
      return text;
    }

    this.logger.debug('Translating text', {
      provider,
      model,
      targetLanguage: normalizedLanguage,
      length: text.length
    });

    if (provider === 'xai') {
      return this.translateWithXai({ text, targetLanguage: normalizedLanguage, model });
    }

    return this.translateWithOpenAi({ text, targetLanguage: normalizedLanguage, model });
  }

  resolveActiveModel() {
    try {
      const active = this.modelProvider?.getActiveModel?.();
      if (active?.provider && active?.model) {
        return active;
      }
    } catch (error) {
      this.logger.warn('Unable to resolve active translation model, falling back', {
        error: error?.message
      });
    }
    const fallbackModel = this.environmentConfig.llmModel;
    if (fallbackModel) {
      return { provider: 'openai', model: fallbackModel };
    }
    return { provider: null, model: null };
  }

  async translateWithOpenAi({ text, targetLanguage, model }) {
    const client = this.ensureOpenAiClient();
    const messages = this.buildPrompt({ targetLanguage, text });

    try {
      const response = await client.responses.create({
        model,
        input: messages,
        max_output_tokens: 200
      });
      const translated = response.output?.[0]?.content?.[0]?.text || response.output_text;
      this.logger.debug('Translation received', {
        provider: 'openai',
        targetLanguage,
        length: translated ? translated.length : null
      });
      return this.normalizeTranslation({ fallback: text, translation: translated });
    } catch (error) {
      this.logger.warn('Translation failed, returning original text', {
        provider: 'openai',
        targetLanguage,
        error: error?.message
      });
      return text;
    }
  }

  async translateWithXai({ text, targetLanguage, model }) {
    if (!this.environmentConfig.xaiApiKey) {
      this.logger.warn('xAI API key missing, returning original text');
      return text;
    }

    const body = {
      model,
      messages: this.buildPrompt({ targetLanguage, text }),
      temperature: 0
    };

    const response = await this.sendXaiChatRequest(body);
    if (!response.success) {
      this.logger.warn('xAI translation failed, returning original text', response.errorDetails);
      return text;
    }

    const translated = this.extractXaiContent(response.payload);
    this.logger.debug('Translation received', {
      provider: 'xai',
      targetLanguage,
      length: translated ? translated.length : null
    });
    return this.normalizeTranslation({ fallback: text, translation: translated });
  }

  async sendXaiChatRequest(body) {
    try {
      const response = await fetch(
        `${this.environmentConfig.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.environmentConfig.xaiApiKey}`
          },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          errorDetails: { status: response.status, errorText }
        };
      }

      const payload = await response.json();
      return { success: true, payload };
    } catch (error) {
      return {
        success: false,
        errorDetails: { error: error?.message }
      };
    }
  }

  buildPrompt({ targetLanguage, text }) {
    return [
      {
        role: 'system',
        content:
          'You translate short assistant messages. Translate the user text into the language represented by the ISO 639-1 code provided. Reply with the translation only.'
      },
      {
        role: 'user',
        content: `ISO 639-1 code: ${targetLanguage}\nText:\n${text}`
      }
    ];
  }

  normalizeTranslation({ translation, fallback }) {
    if (typeof translation === 'string' && translation.trim().length > 0) {
      return translation.trim();
    }
    return fallback;
  }

  extractXaiContent(payload) {
    const message = payload?.choices?.[0]?.message?.content;
    if (Array.isArray(message)) {
      return message
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join(' ')
        .trim();
    }
    if (typeof message === 'string') {
      return message.trim();
    }
    return '';
  }

  ensureOpenAiClient() {
    if (!this.openAiClient) {
      this.openAiClient = new OpenAI({ apiKey: this.environmentConfig.llmApiKey });
    }
    return this.openAiClient;
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
