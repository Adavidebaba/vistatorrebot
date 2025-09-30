import OpenAI from 'openai';

export class EmbeddingService {
  constructor({ environmentConfig }) {
    this.environmentConfig = environmentConfig;
    this.client = new OpenAI({ apiKey: environmentConfig.llmApiKey });
  }

  async createEmbedding(text) {
    const response = await this.client.embeddings.create({
      input: text,
      model: this.environmentConfig.embeddingsModel
    });
    return response.data[0].embedding;
  }
}
