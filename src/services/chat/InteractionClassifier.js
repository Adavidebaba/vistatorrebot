export class InteractionClassifier {
  normalizeInteractionType(type) {
    if (typeof type !== 'string') {
      return 'info_support';
    }
    const normalized = type.trim().toLowerCase();
    const allowed = new Set(['info_support', 'non_urgent_report', 'urgent_emergency']);
    return allowed.has(normalized) ? normalized : 'info_support';
  }

  normalizeManagerMessage(message) {
    if (typeof message !== 'string') {
      return '';
    }
    return message.trim();
  }

  normalizeBooleanFlag(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
    }
    return false;
  }

  mapReasonToCategory(reason) {
    return reason === 'urgent' ? 'urgent' : 'missing_info';
  }
}
