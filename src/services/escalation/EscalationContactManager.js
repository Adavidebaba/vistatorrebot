export class EscalationContactManager {
  constructor({ contactRepository, localizationService }) {
    this.contactRepository = contactRepository;
    this.localizationService = localizationService;
  }

  isAwaitingContact(sessionId) {
    const record = this.contactRepository.getBySession(sessionId);
    return record?.status === 'pending';
  }

  hasContact(sessionId) {
    const record = this.contactRepository.getBySession(sessionId);
    return record?.status === 'ready' && typeof record.contact_info === 'string' && record.contact_info.trim().length > 0;
  }

  ensurePending({ sessionId, reason }) {
    this.contactRepository.upsertPending({ sessionId, reason });
  }

  storeContact({ sessionId, contactInfo }) {
    const sanitized = typeof contactInfo === 'string' ? contactInfo.trim() : '';
    if (!sanitized) {
      return;
    }
    this.contactRepository.storeContact({ sessionId, contactInfo: sanitized });
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
