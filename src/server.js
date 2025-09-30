import { EnvironmentConfig } from './config/EnvironmentConfig.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { SchemaMigrator } from './database/migrations/SchemaMigrator.js';
import { AppServer } from './app/AppServer.js';

const environmentConfig = new EnvironmentConfig();
const databaseManager = new DatabaseManager();
const migrator = new SchemaMigrator(databaseManager);
migrator.migrate();

const appServer = new AppServer({ environmentConfig, databaseManager });
appServer.start();
