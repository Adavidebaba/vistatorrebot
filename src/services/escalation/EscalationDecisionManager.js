import { EscalationPhraseCatalog } from './EscalationPhraseCatalog.js';

export class EscalationDecisionManager {
  decide({ llmDecision, userMessage, conversationMessages = [] }) {
    const llmDerived = this.deriveFromLlm(llmDecision);
    if (llmDerived.needsEscalation) {
      return llmDerived;
    }

    const userIntent = this.deriveFromUserIntent(userMessage);
    if (userIntent.needsEscalation) {
      return userIntent;
    }

    const assistantConfirmation = this.deriveFromAssistantConfirmation({
      userMessage,
      conversationMessages
    });
    if (assistantConfirmation.needsEscalation) {
      return assistantConfirmation;
    }

    return { needsEscalation: false, reason: 'none' };
  }

  deriveFromLlm(llmDecision) {
    if (!llmDecision) {
      return { needsEscalation: false, reason: 'none' };
    }

    const needsEscalation = Boolean(llmDecision.needs_escalation);
    const rawReason = typeof llmDecision.escalation_reason === 'string'
      ? llmDecision.escalation_reason
      : 'none';
    const reason = needsEscalation && rawReason === 'none' ? 'missing_info' : rawReason;

    if (needsEscalation && reason !== 'none') {
      return { needsEscalation: true, reason };
    }

    return { needsEscalation: false, reason: 'none' };
  }

  deriveFromUserIntent(userMessage) {
    const normalized = this.normalizeText(userMessage);
    if (!normalized) {
      return { needsEscalation: false, reason: 'none' };
    }

    const managerKeywords = EscalationPhraseCatalog.managerKeywords();
    const contactKeywords = EscalationPhraseCatalog.contactKeywords();

    const referencesManager = this.containsAny(normalized, managerKeywords);
    const referencesContact = this.containsAny(normalized, contactKeywords);

    if (referencesManager && referencesContact) {
      return { needsEscalation: true, reason: 'urgent' };
    }

    const criticalAccessPhrases = EscalationPhraseCatalog.criticalAccessPhrases();
    if (this.containsAny(normalized, criticalAccessPhrases)) {
      return { needsEscalation: true, reason: 'urgent' };
    }

    return { needsEscalation: false, reason: 'none' };
  }

  deriveFromAssistantConfirmation({ userMessage, conversationMessages }) {
    const normalizedUser = this.normalizeText(userMessage);
    if (!normalizedUser) {
      return { needsEscalation: false, reason: 'none' };
    }

    const affirmativePhrases = EscalationPhraseCatalog.affirmativeWords();
    const containsAffirmative = this.containsAnyWord(normalizedUser, affirmativePhrases);

    if (!containsAffirmative) {
      return { needsEscalation: false, reason: 'none' };
    }

    const lastAssistantMessage = this.findLastAssistantMessage(conversationMessages);
    const normalizedAssistant = this.normalizeText(lastAssistantMessage);

    if (!normalizedAssistant) {
      return { needsEscalation: false, reason: 'none' };
    }

    const escalationPrompts = EscalationPhraseCatalog.escalationPrompts();

    if (this.containsAny(normalizedAssistant, escalationPrompts)) {
      return { needsEscalation: true, reason: 'urgent' };
    }

    return { needsEscalation: false, reason: 'none' };
  }

  findLastAssistantMessage(conversationMessages = []) {
    if (!Array.isArray(conversationMessages) || conversationMessages.length === 0) {
      return null;
    }

    const lastUserIndex = this.findLastUserIndex(conversationMessages);
    if (lastUserIndex < 0) {
      return null;
    }

    for (let index = lastUserIndex - 1; index >= 0; index -= 1) {
      const message = conversationMessages[index];
      if (message?.role === 'assistant') {
        return message.content;
      }
    }

    return null;
  }

  findLastUserIndex(conversationMessages = []) {
    for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
      if (conversationMessages[index]?.role === 'user') {
        return index;
      }
    }
    return -1;
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

  containsAny(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
  }

  containsAnyWord(text, words) {
    return words.some((word) => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
      return pattern.test(text);
    });
  }
}
