import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import Database from 'better-sqlite3';
import { AppSettings, ValidationResult } from '../shared/types';

export class SettingsManager {
  private defaultSettings: AppSettings;
  private db: Database.Database;
  private readonly SETTINGS_KEY = 'app_settings';

  constructor(db: Database.Database) {
    this.db = db;

    // Define default settings
    this.defaultSettings = {
      language: 'en',
      downloadPath: path.join(app.getPath('downloads'), 'YouTube'),
      videoQuality: 'best',
      outputTemplate: '[%(uploader_id)s] %(title)s [%(id)s].%(ext)s',
      maxConcurrentDownloads: 3,
      httpPort: 8080,
      wsPort: 8080,
      minimizeToTray: true,
      showNotifications: true
    };
  }

  

  /**
   * Load settings from database, creating with defaults if record doesn't exist
   */
  async load(): Promise<AppSettings> {
    try {
      // Try to load from DB
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(this.SETTINGS_KEY) as {
        value: string
      } | undefined;
      if (row && row.value) {
        const parsed = JSON.parse(row.value) as AppSettings;
        const mergedSettings = {...this.defaultSettings, ...parsed};
        const validation = this.validate(mergedSettings);
        if (!validation.valid) {
          console.warn('Invalid settings found in DB, falling back to defaults:', validation.errors);
          return {...this.defaultSettings};
        }
        return mergedSettings;
      }

      // Save defaults to DB if nothing was found
      await this.save(this.defaultSettings);
      return {...this.defaultSettings};
    } catch (error) {
      console.error('Failed to load settings, falling back to defaults:', error);
      return {...this.defaultSettings};
    }
  }


  /**
   * Save settings to database
   */
  async save(settings: AppSettings): Promise<void> {
    try {
      const validation = this.validate(settings);
      if (!validation.valid) {
        console.error('Attempted to save invalid settings:', validation.errors);
        throw new Error(`Invalid settings provided: ${validation.errors.join(', ')}`);
      }

      const stmt = this.db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO
        UPDATE SET value =excluded.value, updated_at= CURRENT_TIMESTAMP`
      );
      stmt.run(this.SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Reset settings to defaults
   */
  async reset(): Promise<AppSettings> {
    await this.save(this.defaultSettings);
    return {...this.defaultSettings};
  }

  /**
   * Validate settings object
   */
  validate(settings: AppSettings): ValidationResult {
    const errors: string[] = [];

    // Validate downloadPath
    if (!settings.downloadPath || typeof settings.downloadPath !== 'string') {
      errors.push('Download path must be a non-empty string');
    }

    // Validate videoQuality
    const validQualities = ['best', '1080p', '720p', '480p'];
    if (!validQualities.includes(settings.videoQuality)) {
      errors.push(`Video quality must be one of: ${validQualities.join(', ')}`);
    }

    // Validate language
    const validLanguages = ['en', 'ko'];
    if (!settings.language || !validLanguages.includes(settings.language)) {
      errors.push(`Language must be one of: ${validLanguages.join(', ')}`);
    }

    // Validate maxConcurrentDownloads
    if (!Number.isInteger(settings.maxConcurrentDownloads) ||
      settings.maxConcurrentDownloads < 1 ||
      settings.maxConcurrentDownloads > 10) {
      errors.push('Max concurrent downloads must be an integer between 1 and 10');
    }

    // Validate httpPort
    if (!Number.isInteger(settings.httpPort) ||
      settings.httpPort < 1024 ||
      settings.httpPort > 65535) {
      errors.push('HTTP port must be an integer between 1024 and 65535');
    }

    // Validate wsPort
    if (!Number.isInteger(settings.wsPort) ||
      settings.wsPort < 1024 ||
      settings.wsPort > 65535) {
      errors.push('WebSocket port must be an integer between 1024 and 65535');
    }

    if (typeof settings.minimizeToTray !== 'boolean') {
      errors.push('Minimize to tray must be a boolean');
    }

    if (typeof settings.showNotifications !== 'boolean') {
      errors.push('Show notifications must be a boolean');
    }

    // Validate outputTemplate
    if (!settings.outputTemplate || typeof settings.outputTemplate !== 'string') {
      errors.push('Output template must be a non-empty string');
    }

    if (errors.length > 0) {
      console.log('Invalid settings found:', errors);
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get default settings
   */
  getDefaults(): AppSettings {
    return {...this.defaultSettings};
  }

  
}