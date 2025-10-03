import { DocumentChunker } from '../utils/DocumentChunker.js';

export class DocumentManager {
  constructor({ docsCacheRepository, environmentConfig, chunker } = {}) {
    this.docsCacheRepository = docsCacheRepository;
    this.environmentConfig = environmentConfig;
    this.chunker = chunker || new DocumentChunker();
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
    this.docsCacheRepository.saveDocument(content);

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
    const documentContent = await this.ensureDocumentLoaded();
    if (!documentContent) {
      return [];
    }

    const chunks = this.chunker.chunk(documentContent);
    if (chunks.length === 0) {
      return [];
    }

    const normalizedMessage = (message || '').toLowerCase();
    if (!normalizedMessage) {
      return chunks.slice(0, topK);
    }

    const keywords = normalizedMessage
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3);

    const scoredChunks = chunks.map((chunk, index) => {
      const chunkText = chunk.content.toLowerCase();
      const score = keywords.reduce(
        (total, keyword) => (chunkText.includes(keyword) ? total + 1 : total),
        0
      );
      return { chunk, score, index };
    });

    const sorted = scoredChunks.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    });

    const maxScore = sorted[0]?.score || 0;
    const selected = sorted.slice(0, topK).map((item) => item.chunk);
    if (maxScore === 0) {
      return chunks.slice(0, topK);
    }
    return selected;
  }
}
