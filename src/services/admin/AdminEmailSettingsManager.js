export class AdminEmailSettingsManager {
  constructor({ settingsRepository, environmentConfig }) {
    this.settingsRepository = settingsRepository;
    this.environmentConfig = environmentConfig;
  }

  getAdminEmail() {
    const stored = this.resolveStoredEmail();
    if (stored) {
      return stored;
    }
    const fallback = this.normalize(this.environmentConfig?.adminEmailTo || '');
    if (!fallback) {
      return '';
    }
    return this.validateEmail(fallback) ? fallback : '';
  }

  updateAdminEmail(email) {
    const { normalized, isEmpty, isValid } = this.normalizeForUpdate(email);
    if (!isEmpty && !isValid) {
      return { updated: false, reason: 'invalid_email' };
    }
    this.settingsRepository.saveSetting('admin_email', normalized);
    return { updated: true, email: normalized };
  }

  getNotificationEmail() {
    return this.getAdminEmail();
  }

  resolveStoredEmail() {
    const record = this.settingsRepository.getSetting('admin_email');
    const normalized = this.normalize(record?.value || '');
    if (!normalized) {
      return '';
    }
    return this.validateEmail(normalized) ? normalized : '';
  }

  normalize(rawValue) {
    if (typeof rawValue !== 'string') {
      return '';
    }
    return rawValue.trim().toLowerCase();
  }

  normalizeForUpdate(value) {
    if (typeof value !== 'string') {
      return { normalized: '', isEmpty: true, isValid: false };
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return { normalized: '', isEmpty: true, isValid: true };
    }
    const normalized = trimmed.toLowerCase();
    const isValid = this.validateEmail(normalized);
    return { normalized: isValid ? normalized : '', isEmpty: false, isValid };
  }

  validateEmail(value) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(value);
  }
}
