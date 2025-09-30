import dotenv from 'dotenv';

dotenv.config();

export class EnvironmentConfig {
  constructor(envSource = process.env) {
    this.env = envSource;
  }

  get port() {
    return Number(this.env.PORT || 3000);
  }

  get adminPassword() {
    return this.env.ADMIN_PASSWORD || '';
  }

  get adminEmailTo() {
    return this.env.ADMIN_EMAIL_TO || '';
  }

  get smtpConfig() {
    return {
      host: this.env.SMTP_HOST,
      port: Number(this.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: this.env.SMTP_USER,
        pass: this.env.SMTP_PASS
      }
    };
  }

  get llmApiKey() {
    return this.env.LLM_API_KEY || '';
  }

  get llmModel() {
    return this.env.LLM_MODEL || 'gpt-4o-mini';
  }

  get embeddingsModel() {
    return this.env.EMBEDDINGS_MODEL || 'text-embedding-3-small';
  }

  get googleDocUrl() {
    return this.env.GOOGLE_DOC_PUBLIC_URL || '';
  }

  get documentRefreshSeconds() {
    return Number(this.env.DOC_REFRESH_SEC || 600);
  }
}
