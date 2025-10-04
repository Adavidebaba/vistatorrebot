import { Logger } from '../utils/Logger.js';

export class ChatCoordinator {
  constructor({
    sessionRepository,
    messageRepository,
    escalationRepository,
    documentManager,
    llmChatService,
    emailNotificationService,
    escalationLocalizationService,
    escalationContactManager,
    escalationIntentDetector
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.escalationRepository = escalationRepository;
    this.documentManager = documentManager;
    this.llmChatService = llmChatService;
    this.emailNotificationService = emailNotificationService;
    this.escalationLocalizationService = escalationLocalizationService;
    this.escalationContactManager = escalationContactManager;
    this.escalationIntentDetector = escalationIntentDetector;
    this.logger = Logger.for('ChatCoordinator');
  }

  async handleMessage({ sessionId, userMessage }) {
    this.logger.debug('Handling message', { sessionId, hasText: Boolean(userMessage) });
    const session = this.sessionRepository.getOrCreateSession(sessionId);
    const storedLanguage = this.normalizeLanguageCode(session.language);
    this.sessionRepository.updateLastSeen(session.id, storedLanguage);
    this.logger.debug('Session updated with language', {
      sessionId: session.id,
      detectedLanguage: storedLanguage
    });

    this.messageRepository.addMessage({
      sessionId: session.id,
      role: 'user',
      content: userMessage
    });

    if (this.escalationContactManager?.isAwaitingConfirmation(session.id)) {
      this.logger.debug('Awaiting escalation confirmation', { sessionId: session.id });
      return this.handleEscalationConfirmation({
        session,
        userMessage,
        detectedLanguage: storedLanguage
      });
    }

    if (this.escalationContactManager?.isAwaitingContact(session.id)) {
      this.logger.debug('Awaiting contact information', { sessionId: session.id });
      return this.handlePendingEscalationContact({
        session,
        userMessage,
        detectedLanguage: storedLanguage
      });
    }

    return this.handleMessageWithLlm({
      session,
      userMessage,
      fallbackLanguage: storedLanguage
    });
  }

  getConversationMessages(sessionId) {
    return this.messageRepository.listMessagesForSession(sessionId).map(({ role, content }) => ({
      role,
      content
    }));
  }

  resolveEscalationDecision(llmDecision) {
    const needsEscalation = Boolean(llmDecision?.needs_escalation);
    if (!needsEscalation) {
      return { needsEscalation: false, reason: 'none' };
    }

    const rawReason = typeof llmDecision?.escalation_reason === 'string'
      ? llmDecision.escalation_reason.trim().toLowerCase()
      : '';

    return {
      needsEscalation: true,
      reason: rawReason || 'missing_info'
    };
  }

  async buildEscalationPrompt({ llmDecision, languageCode }) {
    if (!this.shouldDisplayPrompt(llmDecision)) {
      return { shouldDisplay: false };
    }

    const normalizedLanguage = this.normalizeLanguageCode(languageCode);
    const metadata = llmDecision?.metadata?.escalation_prompt || {};
    const fallback = await this.resolvePromptFallback(normalizedLanguage);
    const buttonLabels = this.selectLocalizedValue({
      custom: metadata.button_labels,
      fallback: fallback.buttonLabels,
      languageCode: normalizedLanguage
    });
    const confirmationMessages = this.selectLocalizedValue({
      custom: metadata.confirmation_messages,
      fallback: fallback.confirmationMessages,
      languageCode: normalizedLanguage
    });

    return {
      shouldDisplay: true,
      buttonLabels,
      confirmationMessages
    };
  }

  async resolvePromptFallback(languageCode) {
    const defaultFallback = {
      buttonLabels: { en: 'Notify the manager' },
      confirmationMessages: { en: 'Yes, please notify the manager for me.' }
    };
    if (!this.escalationLocalizationService) {
      return defaultFallback;
    }
    try {
      const localized = await this.escalationLocalizationService.buildPromptFallback(
        this.normalizeLanguageCode(languageCode)
      );
      return localized || defaultFallback;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Prompt localization failed, using default strings', error);
      return defaultFallback;
    }
  }

  shouldUseIntentFallback(llmDecision) {
    if (!this.escalationIntentDetector) {
      return false;
    }
    const hasEscalationFlag = typeof llmDecision?.needs_escalation === 'boolean';
    const hasPromptFlag = this.shouldDisplayPrompt(llmDecision);
    return !hasEscalationFlag && !hasPromptFlag;
  }

  async ensurePromptVisible({ languageCode, currentPrompt }) {
    if (currentPrompt?.shouldDisplay) {
      return currentPrompt;
    }
    const fallback = await this.resolvePromptFallback(languageCode);
    return {
      shouldDisplay: true,
      buttonLabels: fallback.buttonLabels,
      confirmationMessages: fallback.confirmationMessages
    };
  }

  shouldDisplayPrompt(llmDecision) {
    if (!llmDecision) {
      return false;
    }
    if (llmDecision.show_escalation_prompt === true) {
      return true;
    }
    const explicit = llmDecision?.metadata?.show_escalation_prompt;
    return explicit === true;
  }

  selectLocalizedValue({ custom, fallback, languageCode }) {
    const normalizedCustom = this.normalizeRecord(custom);
    const source = Object.keys(normalizedCustom).length > 0 ? normalizedCustom : fallback;

    if (languageCode && source[languageCode]) {
      return { [languageCode]: source[languageCode] };
    }

    return source;
  }

  normalizeRecord(record) {
    if (!record || typeof record !== 'object') {
      return {};
    }

    return Object.entries(record).reduce((accumulator, [key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        const normalizedKey = this.normalizeLanguageCode(key) || key;
        accumulator[normalizedKey] = value.trim();
      }
      return accumulator;
    }, {});
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
      por: 'pt',
      sun: 'su',
      nya: 'ny'
    };

    if (normalized.length === 3 && iso3ToIso2[normalized]) {
      return iso3ToIso2[normalized];
    }

    return normalized;
  }

  mergeAnswerWithContactRequest({ answer, contactRequest }) {
    if (!answer) {
      return contactRequest;
    }
    if (!contactRequest) {
      return answer;
    }
    return `${answer}\n\n${contactRequest}`;
  }

  async handlePendingEscalationContact({ session, userMessage, detectedLanguage }) {
    const normalizedLanguage = this.normalizeLanguageCode(detectedLanguage);
    const trimmed = typeof userMessage === 'string' ? userMessage.trim() : '';

    if (!trimmed) {
      const reminder = await this.escalationContactManager.buildContactRequestMessage(
        normalizedLanguage
      );
      this.logger.debug('Reminder for contact info issued', { sessionId: session.id });
      this.messageRepository.addMessage({
        sessionId: session.id,
        role: 'assistant',
        content: reminder,
        confidence: null
      });
      return {
        answer: reminder,
        escalated: false
      };
    }

    const confirmationIntent = this.escalationIntentDetector
      ? await this.escalationIntentDetector.analyzeUserConfirmation({ message: trimmed })
      : 'unknown';
    if (confirmationIntent === 'affirmative' && trimmed.length <= 5) {
      const reminder = await this.escalationContactManager.buildContactRequestMessage(
        normalizedLanguage
      );
      this.messageRepository.addMessage({
        sessionId: session.id,
        role: 'assistant',
        content: reminder,
        confidence: null
      });
      this.logger.debug('Contact input too short, asking again', { sessionId: session.id, userMessage });
      return {
        answer: reminder,
        escalated: false
      };
    }

    this.escalationContactManager.storeContact({ sessionId: session.id, contactInfo: trimmed });
    const reason = this.escalationContactManager.getReason(session.id);
    this.logger.info('Contact information captured', {
      sessionId: session.id,
      reason
    });

    await this.processEscalation({
      sessionId: session.id,
      reason,
      contactInfo: trimmed
    });

    const confirmation = await this.escalationContactManager.buildContactConfirmationMessage(
      normalizedLanguage
    );
    this.messageRepository.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: confirmation,
      confidence: null
    });

    this.escalationContactManager.clear(session.id);

    return {
      answer: confirmation,
      escalated: true,
      reason
    };
  }

  async handleEscalationConfirmation({ session, userMessage, detectedLanguage }) {
    const normalizedLanguage = this.normalizeLanguageCode(detectedLanguage);
    const confirmation = await this.escalationIntentDetector?.analyzeUserConfirmation({
      message: userMessage
    });
    this.logger.debug('Confirmation intent detected', {
      sessionId: session.id,
      confirmation
    });

    if (confirmation === 'affirmative') {
      const reason = this.escalationContactManager.getReason(session.id) || 'missing_info';
      this.escalationContactManager.ensurePending({ sessionId: session.id, reason });
      const contactRequest = await this.escalationContactManager.buildContactRequestMessage(
        normalizedLanguage
      );

      this.messageRepository.addMessage({
        sessionId: session.id,
        role: 'assistant',
        content: contactRequest,
        confidence: null
      });
      this.logger.info('User confirmed escalation, requesting contact details', {
        sessionId: session.id,
        reason
      });

      return {
        answer: contactRequest,
        escalated: false
      };
    }

    if (confirmation === 'negative') {
      this.escalationContactManager.clear(session.id);
      const declinedMessage = this.escalationLocalizationService
        ? await this.escalationLocalizationService.buildContactDeclinedMessage(normalizedLanguage)
        : 'Understood, I will stay available if you need anything else.';

      this.messageRepository.addMessage({
        sessionId: session.id,
        role: 'assistant',
        content: declinedMessage,
        confidence: null
      });
      this.logger.info('User declined escalation after confirmation', {
        sessionId: session.id
      });

      return {
        answer: declinedMessage,
        escalated: false
      };
    }

    // Unknown response: defer to LLM for clarification by clearing awaiting state.
    this.escalationContactManager.clear(session.id);
    return this.handleMessageWithLlm({
      session,
      userMessage,
      fallbackLanguage: normalizedLanguage
    });
  }

  async handleMessageWithLlm({ session, userMessage, fallbackLanguage }) {
    await this.documentManager.ensureDocumentLoaded();
    const contextFragments = await this.documentManager.getRelevantChunks(userMessage);
    const conversationMessages = this.getConversationMessages(session.id);
    const baseLanguage = this.normalizeLanguageCode(fallbackLanguage);

    let llmResult;
    try {
      llmResult = await this.llmChatService.generateResponse({
        conversationMessages,
        contextFragments
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('LLM response generation failed', {
        sessionId: session.id,
        message: error?.message,
        status: error?.status ?? error?.code,
        details: error?.response?.data ?? null
      });
      llmResult = {
        answer:
          'Mi dispiace, sto avendo un problema temporaneo nel recuperare le informazioni. Posso comunque provare a rispondere o, se preferisce, posso avvisare il gestore: mi faccia sapere.',
        confidence: 0,
        needs_escalation: false,
        escalation_reason: 'none',
        language_code: baseLanguage || 'it'
      };
    }

    const answer = llmResult.answer || 'Mi dispiace, si è verificato un problema nel generare la risposta.';
    const confidence = typeof llmResult.confidence === 'number' ? llmResult.confidence : null;
    const languageFromLlm = this.normalizeLanguageCode(llmResult.language_code);
    const normalizedLanguage = languageFromLlm || baseLanguage;
    this.logger.debug('Language resolved for session', {
      sessionId: session.id,
      languageFromLlm,
      baseLanguage,
      normalizedLanguage
    });
    const escalationDecision = this.resolveEscalationDecision(llmResult);
    this.logger.debug('Escalation decision from LLM', {
      sessionId: session.id,
      escalationDecision
    });
    let needsEscalation = escalationDecision.needsEscalation;
    let escalationReason = escalationDecision.reason;
    let escalationPromptState = await this.buildEscalationPrompt({
      llmDecision: llmResult,
      languageCode: normalizedLanguage
    });
    let finalAnswer = answer;

    let intentAnalysis = null;
    if (this.shouldUseIntentFallback(llmResult)) {
      intentAnalysis = await this.escalationIntentDetector.analyzeAssistantMessage({ answer });
    }
    if (intentAnalysis) {
      this.logger.debug('Escalation intent analysis', {
        sessionId: session.id,
        intentAnalysis
      });
    }

    if (!needsEscalation && intentAnalysis?.escalateImmediately) {
      needsEscalation = true;
      if (!escalationReason || escalationReason === 'none') {
        escalationReason = intentAnalysis.reasonHint || 'urgent';
      }
    }

    if (needsEscalation && (!escalationReason || escalationReason === 'none') && intentAnalysis?.reasonHint) {
      escalationReason = intentAnalysis.reasonHint;
    }

    if (!needsEscalation && intentAnalysis?.promptConfirmation) {
      const reason = escalationReason && escalationReason !== 'none'
        ? escalationReason
        : intentAnalysis.reasonHint || 'missing_info';
      this.escalationContactManager?.markAwaitingConfirmation({
        sessionId: session.id,
        reason
      });
      escalationPromptState = await this.ensurePromptVisible({
        languageCode: normalizedLanguage,
        currentPrompt: escalationPromptState
      });
    }

    if (needsEscalation && escalationReason !== 'none') {
      if (this.escalationContactManager?.hasContact(session.id)) {
        await this.processEscalation({
          sessionId: session.id,
          reason: escalationReason,
          contactInfo: this.escalationContactManager.getContactInfo(session.id)
        });
        this.escalationContactManager.clear(session.id);
      } else {
        this.escalationContactManager?.ensurePending({
          sessionId: session.id,
          reason: escalationReason
        });
        this.logger.info('Escalation pending contact info', {
          sessionId: session.id,
          reason: escalationReason
        });
        const contactRequest = this.escalationContactManager
          ? await this.escalationContactManager.buildContactRequestMessage(normalizedLanguage)
          : null;
        if (contactRequest) {
          finalAnswer = this.mergeAnswerWithContactRequest({ answer: finalAnswer, contactRequest });
        }
        needsEscalation = false;
        escalationReason = 'none';
        escalationPromptState = await this.ensurePromptVisible({
          languageCode: normalizedLanguage,
          currentPrompt: escalationPromptState
        });
      }
    }

    this.messageRepository.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: finalAnswer,
      confidence
    });

    this.sessionRepository.updateLastSeen(session.id, normalizedLanguage);

    if (needsEscalation && escalationReason !== 'none') {
      await this.processEscalation({
        sessionId: session.id,
        reason: escalationReason,
        contactInfo: this.escalationContactManager?.getContactInfo(session.id) || ''
      });
      this.escalationContactManager?.clear(session.id);
      this.logger.info('Escalation processed after fallback', {
        sessionId: session.id,
        reason: escalationReason
      });
    }

    return {
      answer: finalAnswer,
      escalated: needsEscalation,
      reason: escalationReason !== 'none' ? escalationReason : undefined,
      escalationPrompt: escalationPromptState.shouldDisplay ? escalationPromptState : undefined
    };
  }

  async processEscalation({ sessionId, reason, contactInfo }) {
    this.sessionRepository.markEscalated(sessionId);
    await this.handleEscalation({
      sessionId,
      type: reason,
      reason,
      contactInfo
    });
  }

  async handleEscalation({ sessionId, type, reason, contactInfo }) {
    const recentMessages = this.messageRepository.getRecentMessages(sessionId, 6).reverse();
    try {
      await this.emailNotificationService.sendEscalationEmail({
        sessionId,
        type,
        reason,
        messages: recentMessages,
        contactInfo: contactInfo || this.escalationContactManager?.getContactInfo(sessionId) || ''
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Errore invio email escalation', error);
    }
    this.escalationRepository.recordEscalation({ sessionId, type, reason });
  }

}
