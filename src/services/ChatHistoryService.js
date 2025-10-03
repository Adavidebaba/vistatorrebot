export class ChatHistoryService {
  constructor({ messageRepository }) {
    this.messageRepository = messageRepository;
  }

  getConversation(sessionId) {
    if (!sessionId) {
      return [];
    }
    const messages = this.messageRepository.listMessagesForSession(sessionId);
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
      confidence: message.confidence ?? null,
      escalated: false,
      reason: undefined
    }));
  }
}
