import { EscalationDecisionManager } from './escalation/EscalationDecisionManager.js';
import { EscalationPromptEvaluator } from './escalation/EscalationPromptEvaluator.js';

export class ChatCoordinator {
  constructor({
    sessionRepository,
    messageRepository,
    escalationRepository,
    documentManager,
    llmChatService,
    emailNotificationService,
    escalationDecisionManager,
    escalationPromptEvaluator,
    languageDetectionService
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.escalationRepository = escalationRepository;
    this.documentManager = documentManager;
    this.llmChatService = llmChatService;
    this.emailNotificationService = emailNotificationService;
    this.escalationDecisionManager =
      escalationDecisionManager || new EscalationDecisionManager();
    this.escalationPromptEvaluator =
      escalationPromptEvaluator || new EscalationPromptEvaluator();
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
    const escalationDecision = this.escalationDecisionManager.decide({
      llmDecision: llmResult,
      userMessage,
      conversationMessages
    });
    const needsEscalation = escalationDecision.needsEscalation;
    const escalationReason = escalationDecision.reason || 'none';
    const escalationPromptState = this.escalationPromptEvaluator.buildPromptState({
      assistantMessage: answer,
      llmDecision: llmResult,
      languageCode: detectedLanguage
    });

    this.messageRepository.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: answer,
      confidence
    });

    if (needsEscalation && escalationReason !== 'none') {
      this.sessionRepository.markEscalated(session.id);
      await this.handleEscalation({
        sessionId: session.id,
        type: escalationReason,
        reason: escalationReason
      });
    }

    return {
      answer,
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

  detectLanguage(text) {
    if (!this.languageDetectionService) {
      return null;
    }
    const detection = this.languageDetectionService.detect(text);
    return detection.isoCode;
  }

  async handleEscalation({ sessionId, type, reason }) {
    const recentMessages = this.messageRepository.getRecentMessages(sessionId, 6).reverse();
    try {
      await this.emailNotificationService.sendEscalationEmail({
        sessionId,
        type,
        reason,
        messages: recentMessages
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Errore invio email escalation', error);
    }
    this.escalationRepository.recordEscalation({ sessionId, type, reason });
  }

}
