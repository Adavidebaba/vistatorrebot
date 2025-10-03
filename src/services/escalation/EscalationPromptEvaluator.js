import { EscalationPhraseCatalog } from './EscalationPhraseCatalog.js';

export class EscalationPromptEvaluator {
  buildPromptState({ assistantMessage, llmDecision, languageCode }) {
    const normalizedLanguage = this.normalizeLanguageCode(languageCode);
    const shouldDisplay = this.shouldDisplay({ assistantMessage, llmDecision });
    if (!shouldDisplay) {
      return { shouldDisplay: false };
    }

    return {
      shouldDisplay: true,
      buttonLabels: this.resolveLabels(normalizedLanguage),
      confirmationMessages: this.resolveConfirmationMessages(normalizedLanguage)
    };
  }

  shouldDisplay({ assistantMessage, llmDecision }) {
    if (this.llmRequestedConfirmation(llmDecision)) {
      return true;
    }

    return this.containsPrompt(this.normalizeText(assistantMessage));
  }

  llmRequestedConfirmation(llmDecision) {
    if (!llmDecision) {
      return false;
    }

    if (llmDecision.show_escalation_prompt === true) {
      return true;
    }

    const explicitFlag = llmDecision?.metadata?.show_escalation_prompt;
    return explicitFlag === true;
  }

  containsPrompt(normalizedMessage) {
    if (!normalizedMessage) {
      return false;
    }
    const prompts = EscalationPhraseCatalog.escalationPrompts();
    return prompts.some((prompt) => normalizedMessage.includes(prompt));
  }

  normalizeText(text) {
    if (typeof text !== 'string') {
      return '';
    }
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();
  }

  normalizeLanguageCode(languageCode) {
    if (typeof languageCode !== 'string') {
      return null;
    }
    const normalized = languageCode.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return normalized;
  }

  resolveLabels(languageCode) {
    const labels = EscalationPhraseCatalog.escalationButtonLabels();
    if (languageCode && labels[languageCode]) {
      return { [languageCode]: labels[languageCode] };
    }
    return labels;
  }

  resolveConfirmationMessages(languageCode) {
    const messages = EscalationPhraseCatalog.confirmationMessages();
    if (languageCode && messages[languageCode]) {
      return { [languageCode]: messages[languageCode] };
    }
    return messages;
  }
}
