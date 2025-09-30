export class SchemaMigrator {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  migrate() {
    this.createSessionsTable();
    this.createMessagesTable();
    this.createEscalationsTable();
    this.createDocsCacheTable();
    this.createDocChunksTable();
  }

  createSessionsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT,
        last_seen_at TEXT,
        language TEXT,
        escalated INTEGER DEFAULT 0
      )
    `;
    this.database.execute(sql);
  }

  createMessagesTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT CHECK(role IN ('user','assistant')),
        content TEXT,
        confidence REAL,
        created_at TEXT
      )
    `;
    this.database.execute(sql);
  }

  createEscalationsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS escalations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        type TEXT CHECK(type IN ('missing_info','urgent')),
        reason TEXT,
        email_sent_at TEXT
      )
    `;
    this.database.execute(sql);
  }

  createDocsCacheTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS docs_cache (
        id TEXT PRIMARY KEY,
        content TEXT,
        updated_at TEXT
      )
    `;
    this.database.execute(sql);
  }

  createDocChunksTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS doc_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chunk_id TEXT,
        content TEXT,
        embedding TEXT,
        created_at TEXT
      )
    `;
    this.database.execute(sql);
  }
}
