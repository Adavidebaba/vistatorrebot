import { Logger } from '../utils/Logger.js';
import { LanguageResolver } from './chat/LanguageResolver.js';
import { EscalationPromptManager } from './chat/EscalationPromptManager.js';
import { InteractionClassifier } from './chat/InteractionClassifier.js';

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
    this.languageResolver = new LanguageResolver();
    this.promptManager = new EscalationPromptManager({
      localizationService: this.escalationLocalizationService,
      languageResolver: this.languageResolver
    });
    this.interactionClassifier = new InteractionClassifier();
  }

  async handleMessage({ sessionId, userMessage }) {
    this.logger.debug('Handling message', { sessionId, hasText: Boolean(userMessage) });
    const session = this.sessionRepository.getOrCreateSession(sessionId);
    const storedLanguage = this.languageResolver.normalize(session.language);
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

  shouldUseIntentFallback(llmDecision) {
    if (!this.escalationIntentDetector) {
      return false;
    }
    const hasInteractionType =
      typeof llmDecision?.interaction_type === 'string' && llmDecision.interaction_type.trim().length > 0;
    return !hasInteractionType;
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
    const normalizedLanguage = this.languageResolver.normalize(detectedLanguage);
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
    const managerMessage = this.escalationContactManager.getManagerMessage(session.id);
    this.logger.info('Contact information captured', {
      sessionId: session.id,
      reason
    });

    await this.processEscalation({
      sessionId: session.id,
      reason,
      contactInfo: trimmed,
      managerMessage
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
    const normalizedLanguage = this.languageResolver.normalize(detectedLanguage);
    const confirmation = await this.escalationIntentDetector?.analyzeUserConfirmation({
      message: userMessage
    });
    this.logger.debug('Confirmation intent detected', {
      sessionId: session.id,
      confirmation
    });

    if (confirmation === 'affirmative') {
      const reason = this.escalationContactManager.getReason(session.id) || 'missing_info';
      const managerMessage = this.escalationContactManager.getManagerMessage(session.id);
      const requiresContact = this.escalationContactManager.requiresContact(session.id);
      this.escalationContactManager.ensurePending({
        sessionId: session.id,
        reason,
        managerMessage,
        requiresContact
      });
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
    const baseLanguage = this.languageResolver.normalize(fallbackLanguage);

    let llmResult;
    try {
      llmResult = await this.llmChatService.generateResponse({
        conversationMessages,
        contextFragments
      });
    } catch (error) {
      this.logger.error('LLM response generation failed', {
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
    const languageFromLlm = this.languageResolver.normalize(llmResult.language_code);
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
    let escalationPromptState = await this.promptManager.buildPrompt({
      llmDecision: llmResult,
      languageCode: normalizedLanguage
    });
    let interactionType = this.interactionClassifier.normalizeInteractionType(
      llmResult.interaction_type
    );
    let shouldCollectContact = this.interactionClassifier.normalizeBooleanFlag(
      llmResult.should_collect_contact
    );
    const managerMessage = this.interactionClassifier.normalizeManagerMessage(
      llmResult.manager_message
    );

    if (interactionType === 'non_urgent_report') {
      needsEscalation = true;
      escalationReason = 'non_urgent';
    } else if (interactionType === 'urgent_emergency') {
      needsEscalation = true;
      escalationReason = 'urgent';
      shouldCollectContact = true;
    }

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
      interactionType = 'urgent_emergency';
      shouldCollectContact = true;
    }

    if (needsEscalation && (!escalationReason || escalationReason === 'none') && intentAnalysis?.reasonHint) {
      escalationReason = intentAnalysis.reasonHint;
    }

    if (!needsEscalation && intentAnalysis?.promptConfirmation) {
      const reason = escalationReason && escalationReason !== 'none'
        ? escalationReason
        : intentAnalysis.reasonHint || 'missing_info';
      const requiresContact = shouldCollectContact || reason === 'urgent';
      this.escalationContactManager?.markAwaitingConfirmation({
        sessionId: session.id,
        reason,
        managerMessage,
        requiresContact
      });
      escalationPromptState = await this.promptManager.ensurePromptVisible({
        languageCode: normalizedLanguage,
        currentPrompt: escalationPromptState
      });
    }
    if (needsEscalation && escalationReason !== 'none') {
      const requiresContact =
        shouldCollectContact || this.escalationContactManager?.requiresContact(session.id);
      const contactManager = this.escalationContactManager;

      if (contactManager && managerMessage) {
        contactManager.storeManagerMessage({ sessionId: session.id, managerMessage });
      }

      if (contactManager && requiresContact && !contactManager.hasContact(session.id)) {
        contactManager.ensurePending({
          sessionId: session.id,
          reason: escalationReason,
          managerMessage,
          requiresContact: true
        });
        this.logger.info('Escalation pending contact info', {
          sessionId: session.id,
          reason: escalationReason
        });
        const contactRequest = contactManager
          ? await contactManager.buildContactRequestMessage(normalizedLanguage)
          : null;
        if (contactRequest) {
          finalAnswer = this.mergeAnswerWithContactRequest({ answer: finalAnswer, contactRequest });
        }
        needsEscalation = false;
        escalationReason = 'none';
        escalationPromptState = { shouldDisplay: false };
      } else {
        const contactInfo = contactManager?.getContactInfo(session.id) || '';
        await this.processEscalation({
          sessionId: session.id,
          reason: escalationReason,
          contactInfo,
          managerMessage: managerMessage || contactManager?.getManagerMessage(session.id) || ''
        });
        contactManager?.clear(session.id);
      }
    }

    this.messageRepository.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: finalAnswer,
      confidence
    });

    this.sessionRepository.updateLastSeen(session.id, normalizedLanguage);

    return {
      answer: finalAnswer,
      escalated: needsEscalation,
      reason: escalationReason !== 'none' ? escalationReason : undefined,
      escalationPrompt: escalationPromptState.shouldDisplay ? escalationPromptState : undefined
    };
  }

  async processEscalation({ sessionId, reason, contactInfo, managerMessage = '' }) {
    this.sessionRepository.markEscalated(sessionId);
    await this.handleEscalation({
      sessionId,
      type: this.interactionClassifier.mapReasonToCategory(reason),
      reason,
      contactInfo,
      managerMessage
    });
  }

  async handleEscalation({ sessionId, type, reason, contactInfo, managerMessage }) {
    const recentMessages = this.messageRepository.getRecentMessages(sessionId, 6).reverse();
    try {
      await this.emailNotificationService.sendEscalationEmail({
        sessionId,
        type,
        reason,
        messages: recentMessages,
        contactInfo: contactInfo || this.escalationContactManager?.getContactInfo(sessionId) || '',
        managerMessage
      });
    } catch (error) {
      this.logger.error('Errore invio email escalation', error);
    }
    this.escalationRepository.recordEscalation({
      sessionId,
      type,
      reason,
      details: managerMessage
    });
  }

}
