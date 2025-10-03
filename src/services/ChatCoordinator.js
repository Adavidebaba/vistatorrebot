import { franc } from 'franc-min';

export class ChatCoordinator {
  constructor({
    sessionRepository,
    messageRepository,
    escalationRepository,
    documentManager,
    llmChatService,
    emailNotificationService
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.escalationRepository = escalationRepository;
    this.documentManager = documentManager;
    this.llmChatService = llmChatService;
    this.emailNotificationService = emailNotificationService;
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

    let llmResult;
    try {
      llmResult = await this.llmChatService.generateResponse({
        userMessage,
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
    const needsEscalation = Boolean(llmResult.needs_escalation);
    const escalationReason = llmResult.escalation_reason || 'none';

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
      reason: escalationReason !== 'none' ? escalationReason : undefined
    };
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

  detectLanguage(text) {
    if (!text) {
      return null;
    }
    const code = franc(text, { minLength: 3 });
    const mapping = {
      ita: 'it',
      eng: 'en',
      spa: 'es',
      fra: 'fr',
      deu: 'de',
      por: 'pt'
    };
    return mapping[code] || null;
  }
}
