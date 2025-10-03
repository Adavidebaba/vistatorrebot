export class ConversationDeletionService {
  constructor({
    sessionRepository,
    messageRepository,
    escalationRepository,
    escalationContactRepository
  }) {
    this.sessionRepository = sessionRepository;
    this.messageRepository = messageRepository;
    this.escalationRepository = escalationRepository;
    this.escalationContactRepository = escalationContactRepository;
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
    if (this.escalationContactRepository) {
      this.escalationContactRepository.delete(sessionId);
    }
    this.sessionRepository.deleteSession(sessionId);
    return true;
  }
}
