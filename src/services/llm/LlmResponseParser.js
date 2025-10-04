export class LlmResponseParser {
  parse(response) {
    const rawContent = this.extractContent(response);
    const parsedPayload = this.parseJson(rawContent);
    return this.withDefaultFields(parsedPayload);
  }

  extractContent(response) {
    const message = response?.output?.[0]?.content?.[0]?.text || response?.output_text;

    if (!message) {
      throw new Error('LLM response did not include textual content.');
    }

    return message;
  }

  parseJson(message) {
    try {
      return JSON.parse(message);
    } catch (error) {
      throw new Error('LLM response was not valid JSON.');
    }
  }

  withDefaultFields(payload) {
    const needsEscalation = Boolean(payload.needs_escalation);
    const snippets = this.normalizeSnippets(payload.snippets_used);
    const showEscalationPrompt = this.normalizeBoolean(payload.show_escalation_prompt);
    const metadata = this.normalizeMetadata(payload.metadata);
    const languageCode = this.normalizeLanguageCode(
      payload.language_code || payload.message_language || payload.language
    );

    return {
      answer: payload.answer ?? '',
      confidence: this.normalizeConfidence(payload.confidence),
      needs_escalation: needsEscalation,
      escalation_reason: this.normalizeEscalationReason({
        rawReason: payload.escalation_reason,
        needsEscalation
      }),
      snippets_used: snippets,
      show_escalation_prompt: showEscalationPrompt,
      metadata,
      language_code: languageCode
    };
  }

  normalizeSnippets(snippets) {
    if (!Array.isArray(snippets)) {
      return [];
    }

    return snippets.map((snippet) => String(snippet)).filter((value) => value.length > 0);
  }

  normalizeConfidence(confidence) {
    const numericConfidence = Number(confidence);
    if (Number.isFinite(numericConfidence)) {
      return numericConfidence;
    }

    return 0;
  }

  normalizeEscalationReason({ rawReason, needsEscalation }) {
    const allowedReasons = new Set(['missing_info', 'urgent', 'none']);
    if (typeof rawReason === 'string') {
      const normalized = rawReason.trim().toLowerCase();
      if (allowedReasons.has(normalized)) {
        return normalized;
      }

      if (normalized.length > 0) {
        return needsEscalation ? 'missing_info' : 'none';
      }
    }

    return needsEscalation ? 'missing_info' : 'none';
  }

  normalizeBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return false;
  }

  normalizeMetadata(metadata) {
    if (metadata && typeof metadata === 'object') {
      return metadata;
    }
    return {};
  }

  normalizeLanguageCode(code) {
    if (typeof code !== 'string') {
      return '';
    }
    const normalized = code.trim().toLowerCase();
    if (!normalized) {
      return '';
    }

    const iso3ToIso2 = {
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

    if (normalized.length === 3 && iso3ToIso2[normalized]) {
      return iso3ToIso2[normalized];
    }

    if (normalized.includes('-')) {
      const [primary] = normalized.split('-');
      return primary || normalized;
    }

    return normalized.slice(0, 2);
  }
}
