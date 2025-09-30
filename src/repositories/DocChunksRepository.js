export class DocChunksRepository {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  replaceChunks(chunks) {
    this.database.transaction(() => {
      this.database.execute('DELETE FROM doc_chunks');
      for (const chunk of chunks) {
        this.database.execute(
          `INSERT INTO doc_chunks (chunk_id, content, embedding, created_at)
           VALUES (@chunk_id, @content, @embedding, @created_at)`,
          {
            chunk_id: chunk.chunkId,
            content: chunk.content,
            embedding: JSON.stringify(chunk.embedding),
            created_at: new Date().toISOString()
          }
        );
      }
    });
  }

  listChunks() {
    const rows = this.database.query('SELECT * FROM doc_chunks');
    return rows.map((row) => ({
      chunkId: row.chunk_id,
      content: row.content,
      embedding: JSON.parse(row.embedding)
    }));
  }
}
