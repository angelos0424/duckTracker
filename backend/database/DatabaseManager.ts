import * as os from 'os';
import { DownloadConfig } from '../shared/interfaces';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface DownloadRecord {
  id: number; // Auto-incrementing primary key
  url: string;
  url_id: string; // Unique identifier for the URL
  title: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'check';
  progress: number; // 0-100
  file_path?: string;
  error_message?: string;
  start_time?: string;
  end_time?: string;
  created_at?: string;
}

export interface DatabaseMigration {
  version: number;
  description: string;
  sql: string;
}

export class DatabaseManager {
  private db!: Database.Database;
  private dbPath: string;
  private readonly migrations: DatabaseMigration[] = [
    {
      version: 1,
      description: 'Create initial downloads and schema_version tables',
      sql: `
        CREATE TABLE downloads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          url_id TEXT NOT NULL UNIQUE,
          title TEXT,
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          file_path TEXT,
          error_message TEXT,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_downloads_status ON downloads(status);
        CREATE INDEX idx_downloads_start_time ON downloads(start_time);
        CREATE INDEX idx_downloads_url_id ON downloads(url_id);
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO schema_version (version) VALUES (1);
      `
    },
    {
      version: 2,
      description: 'Create settings table and add default settings',
      sql: `
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
        INSERT INTO settings (key, value) VALUES
        ('maxConcurrentDownloads', '3'),
        ('format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
        INSERT INTO schema_version (version) VALUES (2);
      `
    }
  ];

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.initialize();
  }

  private initialize(): void {
    console.log('DatabaseManager: Attempting to initialize...');
    try {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        console.log(`Creating directory for DB: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      
      this.runMigrations();

      console.log('DatabaseManager: Database initialized successfully at:', this.dbPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`DatabaseManager: Database initialization failed: ${errorMessage}`, { stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      console.log('Database connection closed');
    }
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  private runMigrations(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const tableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'`).get();
      let currentVersion = 0;
      
      if (tableExists) {
        const versionResult = this.db.prepare(`SELECT MAX(version) as version FROM schema_version`).get() as { version: number } | undefined;
        currentVersion = versionResult?.version || 0;
      }

      console.log(`Current database version: ${currentVersion}`);

      const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);
      
      if (pendingMigrations.length === 0) {
        console.log('No pending migrations');
        return;
      }

      console.log(`Applying ${pendingMigrations.length} migration(s)...`);

      this.db.transaction(() => {
        for (const migration of pendingMigrations) {
          console.log(`Applying migration ${migration.version}: ${migration.description}`);
          this.db.exec(migration.sql);
          console.log(`Migration ${migration.version} applied successfully`);
        }
      })();

      console.log('All migrations applied successfully');
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw new Error(`Database migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getSettings(): Promise<DownloadConfig> {
    if (!this.db) {
      throw new Error('Database not initialized.');
    }
    try {
      const stmt = this.db.prepare('SELECT key, value FROM settings');
      const rows = stmt.all() as { key: string; value: string }[];
      const settingsFromDb = rows.reduce((acc, {key, value}) => {
        try {
          acc[key] = JSON.parse(value);
        } catch (e) {
          acc[key] = value;
        }
        return acc;
      }, {} as { [key: string]: any });

      const homeDir = os.homedir();
      const defaultDownloadPath = process.platform === 'win32'
        ? path.join(homeDir, 'Downloads')
        : path.join(homeDir, 'Downloads');

      const defaults: DownloadConfig = {
        outputPath: defaultDownloadPath,
        port: 8080,
        maxConcurrentDownloads: 3,
        format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        videoQuality: 'Best',
        videoFormat: 'mp4',
        videoCodec: 'h264',
      };

      return {...defaults, ...settingsFromDb};
    } catch (error) {
      console.error('Error fetching settings:', error);
      throw new Error(`Failed to fetch settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateSetting(key: string, value: any): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized.');
    }
    try {
      const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      stmt.run(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error updating setting:', error);
      throw new Error(`Failed to update setting: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDownloads(): Promise<DownloadRecord[]> {
    if (!this.db) throw new Error('Database not initialized.');
    try {
      const stmt = this.db.prepare('SELECT * FROM downloads ORDER BY created_at DESC');
      return stmt.all() as DownloadRecord[];
    } catch (error) {
      console.error('Error fetching downloads:', error);
      throw new Error(`Failed to fetch downloads: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async upsertDownload(record: Omit<DownloadRecord, 'id' | 'created_at'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized.');
    try {
      const sql = `
        INSERT INTO downloads (url, url_id, title, status, progress, file_path, error_message, start_time, end_time)
        VALUES (@url, @url_id, @title, @status, @progress, @file_path, @error_message, @start_time, @end_time)
        ON CONFLICT(url_id) DO UPDATE SET
          title = excluded.title,
          status = excluded.status,
          progress = excluded.progress,
          file_path = excluded.file_path,
          error_message = excluded.error_message,
          start_time = excluded.start_time,
          end_time = excluded.end_time;
      `;
      const stmt = this.db.prepare(sql);
      stmt.run(record);
    } catch (error) {
      console.error('Error in upsertDownload:', error);
      throw new Error(`Failed to upsert download record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateDownload(record: Partial<DownloadRecord> & { url_id: string }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized.');
    try {
      const { url_id, ...fieldsToUpdate } = record;
      const fields = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
      if (!fields) return; // Nothing to update

      const values = Object.values(fieldsToUpdate);
      values.push(url_id);

      const stmt = this.db.prepare(`UPDATE downloads SET ${fields} WHERE url_id = ?`);
      stmt.run(...values);
    } catch (error) {
      console.error('Error updating download record:', error);
      throw new Error(`Failed to update download record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDownloadByUrlId(url_id: string): Promise<DownloadRecord | undefined> {
    if (!this.db) throw new Error('Database not initialized.');
    try {
      const stmt = this.db.prepare('SELECT * FROM downloads WHERE url_id = ?');
      return stmt.get(url_id) as DownloadRecord | undefined;
    } catch (error) {
      console.error('Error fetching download by url_id:', error);
      throw new Error(`Failed to fetch download by url_id: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteDownloadsByUrlId(url_ids: string[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized.');
    if (url_ids.length === 0) return;
    try {
      const placeholders = url_ids.map(() => '?').join(',');
      const stmt = this.db.prepare(`DELETE FROM downloads WHERE url_id IN (${placeholders})`);
      stmt.run(...url_ids);
    } catch (error) {
      console.error('Error deleting download records:', error);
      throw new Error(`Failed to delete download records: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
