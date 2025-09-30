import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export class DatabaseManager {
  constructor(databasePath = path.join(process.cwd(), 'data', 'app.db')) {
    this.databasePath = databasePath;
    this.ensureDirectory();
    this.connection = new Database(this.databasePath);
    this.connection.pragma('journal_mode = WAL');
  }

  ensureDirectory() {
    const dir = path.dirname(this.databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  execute(sql, params = {}) {
    return this.connection.prepare(sql).run(params);
  }

  query(sql, params = {}) {
    return this.connection.prepare(sql).all(params);
  }

  queryOne(sql, params = {}) {
    return this.connection.prepare(sql).get(params);
  }

  transaction(callback) {
    return this.connection.transaction(callback)();
  }
}
