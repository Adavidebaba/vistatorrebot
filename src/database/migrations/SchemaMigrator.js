export class SchemaMigrator {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  migrate() {
    this.createSessionsTable();
    this.createMessagesTable();
    this.createEscalationsTable();
    this.createEscalationContactsTable();
    this.createDocsCacheTable();
    this.createDocChunksTable();
    this.createSettingsTable();
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

  createEscalationContactsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS escalation_contacts (
        session_id TEXT PRIMARY KEY,
        status TEXT CHECK(status IN ('pending','ready')),
        reason TEXT,
        contact_info TEXT,
        created_at TEXT,
        updated_at TEXT
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

  createSettingsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      )
    `;
    this.database.execute(sql);
  }
}
