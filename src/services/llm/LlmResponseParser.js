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
    const snippets = this.normalizeSnippets(payload.snippets_used);

    return {
      answer: payload.answer ?? '',
      confidence: this.normalizeConfidence(payload.confidence),
      needs_escalation: Boolean(payload.needs_escalation),
      escalation_reason: this.normalizeEscalationReason(payload.escalation_reason),
      snippets_used: snippets
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

  normalizeEscalationReason(reason) {
    const allowedReasons = new Set(['missing_info', 'urgent', 'none']);
    if (allowedReasons.has(reason)) {
      return reason;
    }

    return 'none';
  }
}
