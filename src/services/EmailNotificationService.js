import nodemailer from 'nodemailer';

export class EmailNotificationService {
  constructor({ environmentConfig }) {
    this.environmentConfig = environmentConfig;
    this.transporter = nodemailer.createTransport(this.environmentConfig.smtpConfig);
  }

  async sendEscalationEmail({ sessionId, type, reason, messages, contactInfo = '' }) {
    const subject = `[URGENTE] Richiesta ospite – sessione ${sessionId} – ${type}`;
    const lines = messages
      .map((message) => `- [${message.created_at}] ${message.role}: ${message.content}`)
      .join('\n');
    const contactSection = contactInfo ? `Contatto fornito: ${contactInfo}\n\n` : '';
    const body = `Tipo: ${type}\nMotivo: ${reason}\n${contactSection}Ultimi messaggi (max 6):\n${lines}\n\nLink admin: /admin?session=${sessionId}`;

    const mailOptions = {
      from: this.environmentConfig.smtpConfig.auth?.user,
      to: this.environmentConfig.adminEmailTo,
      subject,
      text: body
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
}
