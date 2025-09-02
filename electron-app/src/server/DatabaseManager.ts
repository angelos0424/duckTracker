import Database from 'better-sqlite3';
import {app} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import {DatabaseMigration} from '../shared/types';
import {ErrorHandler} from '../main/ErrorHandler';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string | null = null;
  private errorHandler: ErrorHandler;
  private readonly migrations: DatabaseMigration[] = [
    {
      version: 1,
      description: 'Create initial downloads and schema_version tables',
      sql: `
          CREATE TABLE downloads
          (
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              url           TEXT     NOT NULL,
              url_id        TEXT     NOT NULL UNIQUE,
              title         TEXT,
              status        TEXT     NOT NULL,
              progress      INTEGER  DEFAULT 0,
              file_path     TEXT,
              error_message TEXT,
              start_time    DATETIME NOT NULL,
              end_time      DATETIME,
              file_size     INTEGER  DEFAULT 0,
              created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX idx_downloads_status ON downloads (status);
          CREATE INDEX idx_downloads_start_time ON downloads (start_time);
          CREATE INDEX idx_downloads_url_id ON downloads (url_id);
          CREATE TABLE schema_version
          (
              version    INTEGER PRIMARY KEY,
              applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO schema_version (version)
          VALUES (1);
      `
    },
    {
      version: 2,
      description: 'Create settings table',
      sql: `
          CREATE TABLE settings
          (
              key        TEXT PRIMARY KEY,
              value      TEXT     NOT NULL,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO schema_version (version)
          VALUES (2);
      `
    }
  ];

  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Initialize database connection and run migrations
   */
  async initialize(customDbPath?: string): Promise<void> {
    console.log('Attempting to initialize DatabaseManager...');
    try {
      this.determineDbPath(customDbPath);
      console.log(`Database path determined: ${this.dbPath}`);

      if (!this.dbPath) {
        throw new Error('Database path could not be determined.');
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      await this.runMigrations();

      this.reindexDownloadsId();

      console.log('Database initialized successfully at:', this.dbPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Database initialization failed: ${errorMessage}`, {stack: error instanceof Error ? error.stack : undefined});
      const appError = this.errorHandler.getErrorTemplate('DATABASE_CORRUPTION', {
        dbPath: this.dbPath || 'Not determined',
        originalError: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      await this.errorHandler.handle(appError, {showDialog: false});
      throw error; // Re-throw the original error to be caught in main.ts
    }
  }

  private determineDbPath(customDbPath?: string): void {
    try {
      if (customDbPath) {
        console.log(`Using custom DB path: ${customDbPath}`);
        const dbDir = path.dirname(customDbPath);
        if (!fs.existsSync(dbDir)) {
          console.log(`Creating directory for custom DB: ${dbDir}`);
          fs.mkdirSync(dbDir, {recursive: true});
        }
        this.dbPath = customDbPath;
      } else {
        const userDataPath = app.getPath('userData');
        console.log(`Retrieved userData path: ${userDataPath}`);
        const dbDir = path.join(userDataPath, 'data');

        if (!fs.existsSync(dbDir)) {
          console.log(`Data directory does not exist. Creating: ${dbDir}`);
          fs.mkdirSync(dbDir, {recursive: true});
        }

        this.dbPath = path.join(dbDir, 'app.db');
      }
    } catch (error) {
      console.error('Error determining database path:', error);
      // This error will be propagated up to the initialize method's catch block
      throw error;
    }
  }

  /**
   * Re-indexes the 'id' column of the 'downloads' table to be sequential.
   */
  private reindexDownloadsId(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    console.log('Re-indexing downloads table ID...');

    const reindexTransaction = this.db.transaction(() => {
      const database = this.db;

      if (!database) {
        throw new Error('Database not initialized');
      }
      // 1. Create a new table with the same schema, which will have sequential IDs
      database.exec(`
        CREATE TABLE downloads_reindexed
        (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            url           TEXT     NOT NULL,
            url_id        TEXT     NOT NULL UNIQUE,
            title         TEXT,
            status        TEXT     NOT NULL,
            progress      INTEGER  DEFAULT 0,
            file_path     TEXT,
            file_size     INTEGER  DEFAULT 0,
            error_message TEXT,
            start_time    DATETIME NOT NULL,
            end_time      DATETIME,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Copy data from the old table to the new one, letting new IDs be generated
      database.exec(`
        INSERT INTO downloads_reindexed (url, url_id, title, status, progress, file_path, error_message, start_time, end_time, file_size, created_at)
        SELECT url, url_id, title, status, progress, file_path, error_message, start_time, end_time, file_size, created_at
        FROM downloads
        ORDER BY created_at;
      `);

      // 3. Drop the old table
      database.exec(`DROP TABLE downloads;`);

      // 4. Rename the new table to the original name
      database.exec(`ALTER TABLE downloads_reindexed RENAME TO downloads;`);

      // 5. Re-create indexes on the new table
      database.exec(`
        CREATE INDEX idx_downloads_status ON downloads (status);
        CREATE INDEX idx_downloads_start_time ON downloads (start_time);
        CREATE INDEX idx_downloads_url_id ON downloads (url_id);
      `);
    });

    try {
      reindexTransaction();
      console.log('Downloads table ID re-indexing completed successfully.');
    } catch (error) {
      console.error('Failed to re-index downloads table ID:', error);
      throw new Error(`Failed to re-index downloads table ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }

  /**
   * Get database instance (throws if not initialized)
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Check if schema_version table exists
      const tableExists = this.db.prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'schema_version'
      `).get();

      let currentVersion = 0;

      if (tableExists) {
        // Get current schema version
        const versionResult = this.db.prepare(`
            SELECT MAX(version) as version
            FROM schema_version
        `).get() as { version: number } | undefined;

        currentVersion = versionResult?.version || 0;
      }

      console.log(`Current database version: ${currentVersion}`);

      // Apply pending migrations
      const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

      if (pendingMigrations.length === 0) {
        console.log('No pending migrations');
        return;
      }

      console.log(`Applying ${pendingMigrations.length} migration(s)...`);

      // Run migrations in a transaction
      const transaction = this.db.transaction(() => {
        for (const migration of pendingMigrations) {
          console.log(`Applying migration ${migration.version}: ${migration.description}`);

          // Execute migration SQL (may contain multiple statements)
          this.db!.exec(migration.sql);

          console.log(`Migration ${migration.version} applied successfully`);
        }
      });

      transaction();
      console.log('All migrations applied successfully');

    } catch (error) {
      console.error('Migration failed:', error);
      throw new Error(`Database migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}