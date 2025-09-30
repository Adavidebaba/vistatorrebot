export class DocsCacheRepository {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  getCachedDocument() {
    return this.database.queryOne(
      'SELECT * FROM docs_cache WHERE id = @id',
      { id: 'main' }
    );
  }

  saveDocument(content) {
    this.database.execute(
      `REPLACE INTO docs_cache (id, content, updated_at)
       VALUES (@id, @content, @updated_at)`,
      {
        id: 'main',
        content,
        updated_at: new Date().toISOString()
      }
    );
  }
}
