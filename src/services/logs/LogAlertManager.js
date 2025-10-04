import { logNotifier } from '../../utils/LogNotifier.js';
import { Logger } from '../../utils/Logger.js';

export class LogAlertManager {
  constructor({ emailNotificationService }) {
    this.emailNotificationService = emailNotificationService;
    this.logger = Logger.for('LogAlertManager');
    this.unsubscribe = null;
  }

  start() {
    if (this.unsubscribe) {
      return;
    }
    this.unsubscribe = logNotifier.subscribe((event) => {
      this.handleEvent(event).catch((error) => {
        this.logger.info('Log alert handling failed', { error: error?.message || 'unknown' });
      });
    });
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  async handleEvent(event) {
    if (!this.shouldAlert(event)) {
      return;
    }
    const { level, moduleName, message, payload } = this.buildEmailPayload(event);
    try {
      await this.emailNotificationService.sendLogAlertEmail({
        level,
        moduleName,
        message,
        payload
      });
    } catch (error) {
      if (error?.message === 'ADMIN_EMAIL_MISSING') {
        this.logger.info('Log alert skipped: admin email missing');
        return;
      }
      throw error;
    }
  }

  shouldAlert(event) {
    if (!event || typeof event !== 'object') {
      return false;
    }
    return event.level === 'warn' || event.level === 'error';
  }

  buildEmailPayload(event) {
    const level = event.level || 'warn';
    const moduleName = event.module || 'app';
    const message = this.composeMessage(event);
    const payload = this.composePayload(event);
    return { level, moduleName, message, payload };
  }

  composeMessage(event) {
    const timestamp = event.timestamp || new Date().toISOString();
    const logLine = Array.isArray(event.messages) ? event.messages.join(' ') : '';
    if (logLine) {
      return `[${timestamp}] [${event.module || 'app'}] ${logLine}`;
    }
    return `[${timestamp}] [${event.module || 'app'}] Evento log senza messaggi`;
  }

  composePayload(event) {
    if (!event || !Array.isArray(event.messages)) {
      return '';
    }
    const details = {
      livello: event.level,
      modulo: event.module,
      timestamp: event.timestamp,
      messaggi: event.messages
    };
    try {
      return JSON.stringify(details, null, 2);
    } catch (error) {
      return event.messages.join('\n');
    }
  }
}
