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
    languageDetectionService
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.escalationRepository = escalationRepository;
    this.documentManager = documentManager;
    this.llmChatService = llmChatService;
    this.emailNotificationService = emailNotificationService;
    this.escalationLocalizationService = escalationLocalizationService;
    this.escalationContactManager = escalationContactManager;
    this.languageDetectionService = languageDetectionService;
  }

  async handleMessage({ sessionId, userMessage }) {
    const session = this.sessionRepository.getOrCreateSession(sessionId);
    const detectedLanguage = this.detectLanguage(userMessage);
    this.sessionRepository.updateLastSeen(session.id, detectedLanguage);

    this.messageRepository.addMessage({
      sessionId: session.id,
      role: 'user',
      content: userMessage
    });

    if (this.escalationContactManager?.isAwaitingContact(session.id)) {
      return this.handlePendingEscalationContact({
        session,
        userMessage,
        detectedLanguage
      });
    }

    await this.documentManager.ensureDocumentLoaded();
    const contextFragments = await this.documentManager.getRelevantChunks(userMessage);
    const conversationMessages = this.getConversationMessages(session.id);

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
        escalation_reason: 'none'
      };
    }

    const answer = llmResult.answer || 'Mi dispiace, si è verificato un problema nel generare la risposta.';
    const confidence = typeof llmResult.confidence === 'number' ? llmResult.confidence : null;
    const normalizedLanguage = this.normalizeLanguageCode(detectedLanguage);
    const escalationDecision = this.resolveEscalationDecision(llmResult);
    let needsEscalation = escalationDecision.needsEscalation;
    let escalationReason = escalationDecision.reason;
    let escalationPromptState = await this.buildEscalationPrompt({
      llmDecision: llmResult,
      languageCode: normalizedLanguage
    });
    let finalAnswer = answer;

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
        const contactRequest = this.escalationContactManager
          ? await this.escalationContactManager.buildContactRequestMessage(normalizedLanguage)
          : null;
        if (contactRequest) {
          finalAnswer = this.mergeAnswerWithContactRequest({ answer: finalAnswer, contactRequest });
        }
        needsEscalation = false;
        escalationReason = 'none';
        escalationPromptState = { shouldDisplay: false };
      }
    }

    this.messageRepository.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: finalAnswer,
      confidence
    });

    if (needsEscalation && escalationReason !== 'none') {
      await this.processEscalation({
        sessionId: session.id,
        reason: escalationReason,
        contactInfo: this.escalationContactManager?.getContactInfo(session.id) || ''
      });
      this.escalationContactManager?.clear(session.id);
    }

    return {
      answer: finalAnswer,
      escalated: needsEscalation,
      reason: escalationReason !== 'none' ? escalationReason : undefined,
      escalationPrompt: escalationPromptState.shouldDisplay ? escalationPromptState : undefined
    };
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
    let fallback = null;
    if (this.escalationLocalizationService) {
      try {
        fallback = await this.escalationLocalizationService.buildPromptFallback(normalizedLanguage);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Prompt localization failed, using default strings', error);
      }
    }
    const defaultFallback = {
      buttonLabels: { en: 'Notify the manager' },
      confirmationMessages: { en: 'Yes, please notify the manager for me.' }
    };
    const resolvedFallback = fallback || defaultFallback;
    const buttonLabels = this.selectLocalizedValue({
      custom: metadata.button_labels,
      fallback: resolvedFallback.buttonLabels,
      languageCode: normalizedLanguage
    });
    const confirmationMessages = this.selectLocalizedValue({
      custom: metadata.confirmation_messages,
      fallback: resolvedFallback.confirmationMessages,
      languageCode: normalizedLanguage
    });

    return {
      shouldDisplay: true,
      buttonLabels,
      confirmationMessages
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
      por: 'pt'
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

  detectLanguage(text) {
    if (!this.languageDetectionService) {
      return null;
    }
    const detection = this.languageDetectionService.detect(text);
    return detection.isoCode;
  }

  async handlePendingEscalationContact({ session, userMessage, detectedLanguage }) {
    const normalizedLanguage = this.normalizeLanguageCode(detectedLanguage);
    const trimmed = typeof userMessage === 'string' ? userMessage.trim() : '';

    if (!trimmed) {
      const reminder = await this.escalationContactManager.buildContactRequestMessage(
        normalizedLanguage
      );
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

    this.escalationContactManager.storeContact({ sessionId: session.id, contactInfo: trimmed });
    const reason = this.escalationContactManager.getReason(session.id);

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
