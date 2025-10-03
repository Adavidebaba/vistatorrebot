export class ConversationDeletionService {
  constructor({
    sessionRepository,
    messageRepository,
    escalationRepository
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.escalationRepository = escalationRepository;
  }

  deleteSession(sessionId) {
    if (!sessionId) {
      return false;
    }

    const existing = this.sessionRepository.getSessionWithMessages(sessionId);
    if (!existing) {
      return false;
    }

    this.messageRepository.deleteBySession(sessionId);
    this.escalationRepository.deleteBySession(sessionId);
    this.sessionRepository.deleteSession(sessionId);
    return true;
  }
}
