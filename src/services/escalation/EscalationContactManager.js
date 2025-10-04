import { Logger } from '../../utils/Logger.js';

export class EscalationContactManager {
  constructor({ contactRepository, localizationService }) {
    this.contactRepository = contactRepository;
    this.localizationService = localizationService;
    this.logger = Logger.for('EscalationContactManager');
  }

  isAwaitingContact(sessionId) {
    const record = this.contactRepository.getBySession(sessionId);
    return record?.status === 'pending';
  }

  isAwaitingConfirmation(sessionId) {
    const record = this.contactRepository.getBySession(sessionId);
    return record?.status === 'awaiting_confirmation';
  }

  hasContact(sessionId) {
    const record = this.contactRepository.getBySession(sessionId);
    return record?.status === 'ready' && typeof record.contact_info === 'string' && record.contact_info.trim().length > 0;
  }

  markAwaitingConfirmation({ sessionId, reason }) {
    this.contactRepository.markAwaitingConfirmation({ sessionId, reason });
    this.logger.debug('Marked awaiting confirmation', { sessionId, reason });
  }

  ensurePending({ sessionId, reason }) {
    this.contactRepository.markPending({ sessionId, reason });
    this.logger.debug('Marked escalation pending', { sessionId, reason });
  }

  storeContact({ sessionId, contactInfo }) {
    const sanitized = typeof contactInfo === 'string' ? contactInfo.trim() : '';
    if (!sanitized) {
      return;
    }
    this.contactRepository.storeContact({ sessionId, contactInfo: sanitized });
    this.logger.debug('Stored contact info', { sessionId, length: sanitized.length });
  }

  getReason(sessionId) {
    const record = this.contactRepository.getBySession(sessionId);
    return record?.reason || 'missing_info';
  }

  getContactInfo(sessionId) {
    const record = this.contactRepository.getBySession(sessionId);
    return record?.contact_info || '';
  }

  clear(sessionId) {
    this.contactRepository.delete(sessionId);
    this.logger.debug('Cleared escalation contact row', { sessionId });
  }

  async buildContactRequestMessage(languageCode) {
    if (!this.localizationService) {
      return 'Before I alert the manager, please let me know how they can reach you (phone, email, etc.).';
    }
    return this.localizationService.buildContactRequestMessage(languageCode);
  }

  async buildContactConfirmationMessage(languageCode) {
    if (!this.localizationService) {
      return 'Thanks, I have notified the manager and they will reach out to you shortly.';
    }
    return this.localizationService.buildContactConfirmationMessage(languageCode);
  }
}
