export class DocumentChunker {
  constructor({ minSize = 800, maxSize = 1200 } = {}) {
    this.minSize = minSize;
    this.maxSize = maxSize;
  }

  chunk(text) {
    if (!text) {
      return [];
    }

    const sections = this.splitByHeadings(text);
    const chunks = [];
    let index = 0;

    for (const section of sections) {
      const parts = this.splitSection(section);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) {
          continue;
        }
        chunks.push({
          chunkId: `chunk_${index}`,
          content: trimmed
        });
        index += 1;
      }
    }

    return chunks;
  }

  splitByHeadings(text) {
    const lines = text.split(/\r?\n/);
    const sections = [];
    let current = [];

    for (const line of lines) {
      if (/^\s*#{1,6}\s/.test(line) && current.length > 0) {
        sections.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    }

    if (current.length > 0) {
      sections.push(current.join('\n'));
    }

    return sections;
  }

  splitSection(section) {
    if (section.length <= this.maxSize) {
      return [section];
    }

    const sentences = section.split(/(?<=[.!?])\s+/);
    const parts = [];
    let buffer = '';

    for (const sentence of sentences) {
      if ((buffer + ' ' + sentence).trim().length > this.maxSize && buffer.length > 0) {
        parts.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }

    if (buffer.trim().length > 0) {
      parts.push(buffer.trim());
    }

    const merged = [];
    let current = '';

    for (const part of parts) {
      if ((current + '\n' + part).trim().length < this.minSize && current) {
        current = `${current}\n${part}`;
      } else {
        if (current) {
          merged.push(current.trim());
        }
        current = part;
      }
    }

    if (current) {
      merged.push(current.trim());
    }

    return merged;
  }
}
