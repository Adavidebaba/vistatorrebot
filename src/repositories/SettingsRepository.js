export class SettingsRepository {
  constructor(databaseManager) {
    this.database = databaseManager;
  }

  getValue(key) {
    const row = this.database.queryOne(
      'SELECT value FROM settings WHERE key = @key',
      { key }
    );
    return row ? row.value : null;
  }

  setValue(key, value) {
    this.database.execute(
      `REPLACE INTO settings (key, value, updated_at)
       VALUES (@key, @value, @updated_at)`,
      {
        key,
        value,
        updated_at: new Date().toISOString()
      }
    );
  }

  getSetting(key) {
    return this.database.queryOne('SELECT key, value FROM settings WHERE key = @key', {
      key
    });
  }

  saveSetting(key, value) {
    this.setValue(key, value);
  }
}
