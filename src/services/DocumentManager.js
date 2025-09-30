import { DocumentChunker } from '../utils/DocumentChunker.js';

export class DocumentManager {
  constructor({
    docsCacheRepository,
    docChunksRepository,
    embeddingService,
    environmentConfig
  }) {
    this.docsCacheRepository = docsCacheRepository;
    this.docChunksRepository = docChunksRepository;
    this.embeddingService = embeddingService;
    this.environmentConfig = environmentConfig;
    this.chunker = new DocumentChunker();
  }

  async ensureDocumentLoaded(force = false) {
    const cached = this.docsCacheRepository.getCachedDocument();
    if (!force && cached && !this.isExpired(cached.updated_at)) {
      return cached.content;
    }
    return this.refreshDocument();
  }

  async refreshDocument() {
    if (!this.environmentConfig.googleDocUrl) {
      throw new Error('GOOGLE_DOC_PUBLIC_URL is not configured');
    }

    const response = await fetch(this.environmentConfig.googleDocUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status}`);
    }

    const content = await response.text();
    const chunks = this.chunker.chunk(content);
    const enrichedChunks = [];

    for (const chunk of chunks) {
      const embedding = await this.embeddingService.createEmbedding(chunk.content);
      enrichedChunks.push({
        chunkId: chunk.chunkId,
        content: chunk.content,
        embedding
      });
    }

    this.docsCacheRepository.saveDocument(content);
    this.docChunksRepository.replaceChunks(enrichedChunks);

    return content;
  }

  isExpired(updatedAt) {
    if (!updatedAt) {
      return true;
    }
    const updatedDate = new Date(updatedAt).getTime();
    const threshold = this.environmentConfig.documentRefreshSeconds * 1000;
    return Date.now() - updatedDate > threshold;
  }

  async getRelevantChunks(message, topK = 5) {
    const chunks = this.docChunksRepository.listChunks();
    if (chunks.length === 0) {
      return [];
    }

    const queryEmbedding = await this.embeddingService.createEmbedding(message);
    const scored = chunks.map((chunk) => ({
      chunk,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((item) => item.chunk);
  }

  cosineSimilarity(a, b) {
    const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
    const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
    if (normA === 0 || normB === 0) {
      return 0;
    }
    return dot / (normA * normB);
  }
}
