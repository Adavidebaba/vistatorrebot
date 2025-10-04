import nodemailer from 'nodemailer';

export class EmailNotificationService {
  constructor({ environmentConfig, adminEmailSettingsManager }) {
    this.environmentConfig = environmentConfig;
    this.adminEmailSettingsManager = adminEmailSettingsManager;
    this.transporter = nodemailer.createTransport(this.environmentConfig.smtpConfig);
  }

  async sendEscalationEmail({
    sessionId,
    type,
    reason,
    messages,
    contactInfo = '',
    managerMessage = ''
  }) {
    const subject = `[OSPITE] ${reason.toUpperCase()} – sessione ${sessionId} – ${type}`;
    const lines = messages
      .map((message) => `- [${message.created_at}] ${message.role}: ${message.content}`)
      .join('\n');
    const contactSection = contactInfo ? `Contatto fornito: ${contactInfo}\n\n` : '';
    const managerNotes = managerMessage ? `Messaggio per il gestore:\n${managerMessage}\n\n` : '';
    const body = `Tipo: ${type}\nMotivo: ${reason}\n${managerNotes}${contactSection}Ultimi messaggi (max 6):\n${lines}\n\nLink admin: /admin?session=${sessionId}`;

    return this.dispatchMail({
      subject,
      text: body
    });
  }

  async sendLogAlertEmail({ level, moduleName, message, payload }) {
    const subject = `[APP][${level.toUpperCase()}] ${moduleName}`;
    const payloadText = payload ? `\nDettagli: ${payload}` : '';
    const body = `${message}${payloadText}`;
    return this.dispatchMail({ subject, text: body });
  }

  async dispatchMail({ subject, text }) {
    const recipient = this.resolveRecipient();
    if (!recipient) {
      throw new Error('ADMIN_EMAIL_MISSING');
    }
    const mailOptions = {
      from: this.environmentConfig.smtpConfig.auth?.user,
      to: recipient,
      subject,
      text
    };

    const maxAttempts = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxAttempts) {
      try {
        await this.transporter.sendMail(mailOptions);
        return true;
      } catch (error) {
        lastError = error;
        attempt += 1;
      }
    }

    throw lastError;
  }

  resolveRecipient() {
    if (!this.adminEmailSettingsManager) {
      return this.environmentConfig.adminEmailTo;
    }
    return this.adminEmailSettingsManager.getNotificationEmail();
  }
}
