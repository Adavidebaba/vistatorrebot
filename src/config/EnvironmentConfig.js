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
    return this.env.LLM_MODEL || this.primaryModel || 'gpt-4o-mini';
  }

  get primaryModel() {
    return this.env.LLM_MODEL_PRIMARY || this.env.LLM_MODEL || '';
  }

  get fallbackModel() {
    return this.env.LLM_MODEL_FALLBACK || '';
  }

  get availableModels() {
    const models = [this.primaryModel, this.fallbackModel]
      .filter((model) => Boolean(model))
      .filter((model, index, array) => array.indexOf(model) === index);
    if (models.length === 0 && this.llmModel) {
      return [this.llmModel];
    }
    return models;
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

  get llmSystemPrompt() {
    return this.env.LLM_SYSTEM_PROMPT || '';
  }

  get llmReasoningEffort() {
    const raw = (this.env.LLM_REASONING_EFFORT || '').trim().toLowerCase();
    if (!raw) {
      return undefined;
    }
    if (raw === 'null' || raw === 'none') {
      return null;
    }
    if (raw === 'minimal') {
      return 'low';
    }
    const allowed = new Set(['low', 'medium', 'high']);
    if (allowed.has(raw)) {
      return raw;
    }
    return undefined;
  }

  get llmReasoningSummary() {
    const raw = (this.env.LLM_REASONING_SUMMARY || '').trim().toLowerCase();
    if (!raw) {
      return undefined;
    }
    if (raw === 'null' || raw === 'none') {
      return null;
    }
    const allowed = new Set(['auto', 'concise', 'detailed']);
    if (allowed.has(raw)) {
      return raw;
    }
    return undefined;
  }

  get llmMaxOutputTokens() {
    const raw = Number(this.env.LLM_MAX_OUTPUT_TOKENS);
    if (!Number.isFinite(raw) || raw <= 0) {
      return undefined;
    }
    return Math.floor(raw);
  }
}
