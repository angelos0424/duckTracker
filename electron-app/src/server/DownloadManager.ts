import {DatabaseManager} from './DatabaseManager';
import {DownloadRecord} from '../shared/types';
import {EventEmitter} from 'events';
import {ErrorHandler, ErrorCategory, ErrorSeverity} from '../main/ErrorHandler';

export interface DownloadProcess {
  id: string;
  urlId: string;
  url: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'queued';
  progress: number;
  startTime: Date;
  title: string | undefined;
  filePath?: string;
  error: string | undefined;
}

export interface DownloadHistoryQuery {
  limit?: number;
  offset?: number;
  status?: string | undefined;
  sortBy?: 'start_time' | 'title' | 'status';
  sortOrder?: 'ASC' | 'DESC';
}

export class DownloadManager extends EventEmitter {
  private dbManager: DatabaseManager;
  private activeDownloads: Map<string, DownloadProcess> = new Map();
  private errorHandler: ErrorHandler;

  constructor(dbManager: DatabaseManager) {
    super();
    this.dbManager = dbManager;
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Creates a new download record in the database.
   */
  public async createDownloadRecord(url: string, urlId: string, title?: string, status: 'pending' | 'queued' = 'pending'): Promise<DownloadRecord> {
    const db = this.dbManager.getDatabase();
    const now = new Date();
    const downloadRecord: Omit<DownloadRecord, 'id' | 'created_at'> = {
      url,
      urlId,
      title: title || '',
      status: status,
      progress: 0,
      filePath: '',
      errorMessage: '',
      startTime: now,
      endTime: now,
      createdAt: now
    };

    try {
      // Use INSERT OR IGNORE to prevent race conditions from causing a crash
      const stmt = db.prepare(`
          INSERT OR IGNORE INTO downloads (url, url_id, title, status, progress,
                                 file_path, error_message, start_time, end_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        downloadRecord.url,
        downloadRecord.urlId,
        downloadRecord.title,
        downloadRecord.status,
        downloadRecord.progress,
        downloadRecord.filePath,
        downloadRecord.errorMessage,
        downloadRecord.startTime.toISOString(),
        downloadRecord.endTime.toISOString()
      );

      if (result.changes === 0) {
        // The record already existed. Fetch and return it.
        console.warn(`Attempted to create a duplicate download record for urlId: ${urlId}. Fetching existing.`);
        const existingRecord = this.getDownloadByUrlId(urlId);
        if (!existingRecord) {
          // This should not happen if the INSERT was ignored due to a key constraint
          throw new Error(`Failed to create or find download record for urlId: ${urlId}`);
        }
        return existingRecord;
      }

      const newId = String(result.lastInsertRowid);
      let createdRecord = this.getDownloadById(newId);
      if (!createdRecord) {
        throw new Error('Failed to retrieve created download record');
      }

      // Track as active download
      const downloadProcess: DownloadProcess = {
        id: newId,
        urlId,
        url,
        status: 'pending',
        progress: 0,
        startTime: new Date(now),
        title: title || undefined,
        error: undefined
      };
      this.activeDownloads.set(urlId, downloadProcess);

      this.emit('download-updated', createdRecord);
      console.log(`DownloadManager: Emitted download-updated for new record ${newId} with status ${createdRecord.status}`);
      this.emit('refresh-history');
      return createdRecord;

    } catch (error) {
      console.error('Failed to create download record:', error);
      throw new Error(`Failed to create download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handles the start of a download, either by creating a new record or updating an existing one.
   */
  async handleDownloadStart(url: string, urlId: string, title?: string): Promise<DownloadRecord> {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    try {
      // Check if a record with this urlId already exists (e.g., a retried download)
      let existingRecord = this.getDownloadByUrlId(urlId);

      if (existingRecord) {
        console.log(`DownloadManager: Updating existing record ${urlId} to 'downloading'`);
        // Update existing record
        const stmt = db.prepare(`
            UPDATE downloads
            SET status        = ?,
                progress      = ?,
                error_message = NULL,
                start_time    = ?,
                end_time      = NULL,
                title         = COALESCE(?, title)
            WHERE url_id = ?
        `);
        stmt.run('downloading', 0, now, title || null, urlId);

        existingRecord = this.getDownloadByUrlId(urlId); // Re-fetch updated record
        if (!existingRecord) {
          throw new Error('Failed to retrieve updated download record after start handling');
        }

        // Update active download process map
        const activeDownload = this.activeDownloads.get(urlId);
        if (activeDownload) {
          activeDownload.status = 'downloading';
          activeDownload.progress = 0;
          activeDownload.startTime = new Date(now);
          activeDownload.title = title || undefined;
          activeDownload.error = undefined;
        } else {
          // This case should ideally not happen if retry logic is correct, but for safety
          this.activeDownloads.set(urlId, {
            id: existingRecord.id,
            urlId: existingRecord.urlId,
            url: existingRecord.url,
            status: 'downloading',
            progress: 0,
            startTime: new Date(now),
            title: existingRecord.title || undefined,
            error: undefined
          });
        }
        this.emit('download-updated', existingRecord); // Emit a specific event for UI to update
        console.log(`DownloadManager: Emitted download-updated for ${urlId} with status ${existingRecord.status}`);
        return existingRecord;

      } else {
        console.log(`DownloadManager: Creating new record ${urlId} with status 'pending'`);
        // Create a new record if it doesn't exist
        const newRecord = await this.createDownloadRecord(url, urlId, title);
        // The createDownloadRecord already emits 'download-added'
        console.log(`DownloadManager: Emitted download-updated for ${urlId} with status ${newRecord.status}`);
        return newRecord;
      }
    } catch (error) {
      console.error('Failed to handle download start:', error);
      throw new Error(`Failed to handle download start: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update download progress
   */
  async updateProgress(urlId: string, progress: number, title?: string): Promise<void> {
    const db = this.dbManager.getDatabase();

    try {
      // Update database
      const stmt = db.prepare(`
          UPDATE downloads
          SET progress = ?,
              title    = COALESCE(?, title)
          WHERE url_id = ?
            AND status IN ('pending', 'downloading')
      `);

      const result = stmt.run(progress, title || null, urlId);

      if (result.changes === 0) {
        console.warn(`No active download found for urlId: ${urlId}`);
        return;
      }

      // Update active download
      const activeDownload = this.activeDownloads.get(urlId);
      if (activeDownload) {
        activeDownload.progress = progress;
        activeDownload.status = 'downloading';
        if (title) {
          activeDownload.title = title;
        }
      }

      // Get updated record and emit event
      const updatedRecord = this.getDownloadByUrlId(urlId);
      if (updatedRecord) {
        this.emit('download-updated', updatedRecord);
      }

    } catch (error) {
      console.error('Failed to update download progress:', error);
      throw new Error(`Failed to update progress: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark download as completed
   */
  async completeDownload(urlId: string, filePath?: string, title?: string, fileSize?: number): Promise<void> {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    try {
      const stmt = db.prepare(`
          UPDATE downloads
          SET status    = 'completed',
              progress  = 100,
              file_path = COALESCE(?, file_path),
              end_time  = ?,
              title     = COALESCE(?, title),
              file_size = ?
          WHERE url_id = ?
            AND status IN ('pending', 'downloading')
      `);

      const result = stmt.run(filePath||null, now, title || null, fileSize, urlId);

      if (result.changes === 0) {
        console.warn(`No active download found for urlId: ${urlId}`);
        return;
      }

      // Update active download
      const activeDownload = this.activeDownloads.get(urlId);
      if (activeDownload) {
        activeDownload.status = 'completed';
        activeDownload.progress = 100;

        if (title) {
          activeDownload.title = title;
        }
        if (filePath) {
          activeDownload.filePath = filePath;
        }
      }

      // Get updated record and emit event
      const updatedRecord = this.getDownloadByUrlId(urlId);
      if (updatedRecord) {
        this.emit('download-updated', updatedRecord);
        this.emit('download-finished', { ...updatedRecord, status: 'completed' });
      }

      // Remove from active downloads
      this.activeDownloads.delete(urlId);

    } catch (error) {
      console.error('Failed to complete download:', error);
      throw new Error(`Failed to complete download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark download as failed
   */
  async failDownload(urlId: string, error: string, title?: string): Promise<void> {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    try {
      const stmt = db.prepare(`
          UPDATE downloads
          SET status        = 'failed',
              error_message = ?,
              end_time      = ?,
              title         = COALESCE(?, title)
          WHERE url_id = ?
      `);

      const result = stmt.run(error, now, title || null, urlId);

      if (result.changes === 0) {
        console.warn(`No active download found for urlId: ${urlId}`);
        return;
      }

      // Update active download
      const activeDownload = this.activeDownloads.get(urlId);
      if (activeDownload) {
        activeDownload.status = 'failed';
        activeDownload.error = error;
        if (title) {
          activeDownload.title = title;
        }
      }

      // Get updated record and emit event
      const updatedRecord = this.getDownloadByUrlId(urlId);
      if (updatedRecord) {
        this.emit('download-updated', updatedRecord);
        this.emit('download-finished', { ...updatedRecord, status: 'failed' });
      }

      // Remove from active downloads
      this.activeDownloads.delete(urlId);

    } catch (error) {
      console.error('Failed to mark download as failed:', error);
      throw new Error(`Failed to mark download as failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(urlId: string): Promise<void> {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    try {
      const stmt = db.prepare(`
          UPDATE downloads
          SET status   = 'cancelled',
              end_time = ?
          WHERE url_id = ?
            AND status IN ('pending', 'downloading')
      `);

      const result = stmt.run(now, urlId);

      if (result.changes === 0) {
        console.warn(`No active download found for urlId: ${urlId}`);
        return;
      }

      // Update active download
      const activeDownload = this.activeDownloads.get(urlId);
      if (activeDownload) {
        activeDownload.status = 'cancelled';
      }

      // Get updated record and emit event
      const updatedRecord = this.getDownloadByUrlId(urlId);
      if (updatedRecord) {
        this.emit('download-updated', updatedRecord);
      }

      // Remove from active downloads
      this.activeDownloads.delete(urlId);

    } catch (error) {
      console.error('Failed to cancel download:', error);
      throw new Error(`Failed to cancel download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get download history with optional filtering and pagination
   */
  getHistory(query: DownloadHistoryQuery = {}): DownloadRecord[] {
    const db = this.dbManager.getDatabase();

    const {
      limit,
      offset = 0,
      status,
      sortBy = 'start_time',
      sortOrder = 'DESC'
    } = query;

    try {
      let sql = `
        SELECT
          id,
          url,
          url_id as urlId,
          title,
          status,
          progress,
          file_path as filePath,
          file_size as fileSize,
          error_message as errorMessage,
          start_time as startTime,
          end_time as endTime,
          created_at as createdAt
        FROM downloads
      `;
      const params: any[] = [];

      // Add WHERE clause if status filter is provided
      if (status) {
        sql += ' WHERE status = ?';
        params.push(status);
      }

      // Add ORDER BY clause
      sql += ` ORDER BY ${sortBy} ${sortOrder}`;

      // Add LIMIT and OFFSET only if limit is provided
      if (limit !== undefined) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }

      const stmt = db.prepare(sql);
      return stmt.all(...params) as DownloadRecord[];

    } catch (error) {
      console.error('Failed to get download history:', error);
      throw new Error(`Failed to get download history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a specific download record by ID
   */
  getDownloadById(id: string): DownloadRecord | null {
    const db = this.dbManager.getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT
          id,
          url,
          url_id as urlId,
          title,
          status,
          progress,
          file_path as filePath,
          error_message as errorMessage,
          start_time as startTime,
          end_time as endTime,
          created_at as createdAt,
          file_size as fileSize
        FROM downloads
        WHERE id = ?
      `);
      return stmt.get(id) as DownloadRecord || null;
    } catch (error) {
      console.error('Failed to get download by ID:', error);
      return null;
    }
  }

  /**
   * Get a specific download record by URL ID
   */
  getDownloadByUrlId(urlId: string): DownloadRecord | null {
    const db = this.dbManager.getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT
          id,
          url,
          url_id as urlId,
          title,
          status,
          progress,
          file_path as filePath,
          error_message as errorMessage,
          start_time as startTime,
          end_time as endTime,
          created_at as createdAt,
          file_size as fileSize
        FROM downloads
        WHERE url_id = ? ORDER BY created_at DESC LIMIT 1
      `);
      return stmt.get(urlId) as DownloadRecord || null;
    } catch (error) {
      console.error('Failed to get download by URL ID:', error);
      return null;
    }
  }

  /**
   * Delete download records by IDs
   */
  async deleteRecords(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const db = this.dbManager.getDatabase();

    try {
      const placeholders = ids.map(() => '?').join(',');
      const stmt = db.prepare(`DELETE
                               FROM downloads
                               WHERE id IN (${placeholders})`);
      const result = stmt.run(...ids);

      this.emit('records-deleted', ids);
      return result.changes;

    } catch (error) {
      console.error('Failed to delete download records:', error);
      throw new Error(`Failed to delete records: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear all download history
   */
  async clearHistory(): Promise<number> {
    const db = this.dbManager.getDatabase();

    try {
      const stmt = db.prepare('DELETE FROM downloads');
      const result = stmt.run();

      this.emit('history-cleared');
      return result.changes;

    } catch (error) {
      console.error('Failed to clear download history:', error);
      throw new Error(`Failed to clear history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up old completed downloads (older than specified days)
   */
  async cleanupOldDownloads(daysOld: number = 30): Promise<number> {
    const db = this.dbManager.getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      const stmt = db.prepare(`
          DELETE
          FROM downloads
          WHERE status IN ('completed', 'failed', 'cancelled')
            AND created_at < ?
      `);

      const result = stmt.run(cutoffDate.toISOString());

      if (result.changes > 0) {
        this.emit('old-records-cleaned', result.changes);
      }

      return result.changes;

    } catch (error) {
      console.error('Failed to cleanup old downloads:', error);
      throw new Error(`Failed to cleanup old downloads: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get download statistics
   */
  getStatistics(): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    downloading: number;
    cancelled: number;
  } {
    const db = this.dbManager.getDatabase();

    try {
      const stmt = db.prepare(`
          SELECT COUNT(*)                                                as total,
                 SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)   as completed,
                 SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)      as failed,
                 SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)     as pending,
                 SUM(CASE WHEN status = 'downloading' THEN 1 ELSE 0 END) as downloading,
                 SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)   as cancelled
          FROM downloads
      `);

      const result = stmt.get() as any;

      return {
        total: result.total || 0,
        completed: result.completed || 0,
        failed: result.failed || 0,
        pending: result.pending || 0,
        downloading: result.downloading || 0,
        cancelled: result.cancelled || 0
      };

    } catch (error) {
      console.error('Failed to get download statistics:', error);
      return {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        downloading: 0,
        cancelled: 0
      };
    }
  }

  /**
   * Get active downloads
   */
  getActiveDownloads(): DownloadProcess[] {
    return Array.from(this.activeDownloads.values());
  }

  /**
   * Check if a download is active
   */
  isDownloadActive(urlId: string): boolean {
    return this.activeDownloads.has(urlId);
  }

  /**
   * Get active download by URL ID
   */
  getActiveDownload(urlId: string): DownloadProcess | undefined {
    return this.activeDownloads.get(urlId);
  }

  async retryDownload(id: string, status: 'pending' | 'queued' = 'pending'): Promise<DownloadRecord> {
    const download = this.getDownloadById(id);
    if (!download) {
      throw new Error('Download not found or not in a retryable state');
    }

    // Add a check for urlId to prevent errors with old data
    if (!download.urlId) {
      throw new Error(`Cannot retry download ${id}: urlId is missing. This might be an old record.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    try {
      const stmt = db.prepare(
        'UPDATE downloads SET status = ?, progress = ?, error_message = ?, start_time = ?, end_time = ? WHERE id = ?'
      );
      stmt.run(status, 0, null, now, null, id);

      const updatedRecord = this.getDownloadById(id);
      if (!updatedRecord) {
        throw new Error('Failed to retrieve updated download record after retry');
      }

      // Update or add to active downloads map
      const existingDownloadProcess = this.activeDownloads.get(updatedRecord.urlId);
      if (existingDownloadProcess) {
        existingDownloadProcess.status = status;
        existingDownloadProcess.progress = 0.0;
        existingDownloadProcess.startTime = new Date(updatedRecord.startTime);
        existingDownloadProcess.title = updatedRecord.title || undefined;
        existingDownloadProcess.error = undefined; // Clear any previous error
      } else {
        this.activeDownloads.set(updatedRecord.urlId, {
          id: updatedRecord.id,
          urlId: updatedRecord.urlId,
          url: updatedRecord.url,
          status: status,
          progress: 0.0,
          startTime: new Date(updatedRecord.startTime),
          title: updatedRecord.title || undefined,
          error: undefined // Explicitly initialize error
        });
      }

      this.emit('download-updated', updatedRecord);
      this.emit('download-restarted-request', {
        url: updatedRecord.url,
        urlId: updatedRecord.urlId,
        title: updatedRecord.title || undefined
      });
      return updatedRecord;
    } catch (error) {
      console.error(`Failed to retry download ${id}:`, error);
      throw error;
    }
  }

  public getDownloadsByStatus(status: DownloadRecord['status'] | DownloadRecord['status'][]): DownloadRecord[] {
    const db = this.dbManager.getDatabase();
    let sql = `
        SELECT
          id,
          url,
          url_id as urlId,
          title,
          status,
          progress,
          file_path as filePath,
          error_message as errorMessage,
          start_time as startTime,
          end_time as endTime,
          created_at as createdAt
        FROM downloads
        WHERE
      `;
    const params: any[] = [];

    if (Array.isArray(status)) {
      sql += 'status IN (' + status.map(() => '?').join(',') + ')';
      params.push(...status);
    } else {
      sql += 'status = ?';
      params.push(status);
    }
    sql += ' ORDER BY start_time ASC'; // Process older ones first

    try {
      const stmt = db.prepare(sql);
      return stmt.all(...params) as DownloadRecord[];
    } catch (error) {
      console.error(`Failed to get downloads by status ${status}:`, error);
      return [];
    }
  }

  public popNextQueuedDownload(): DownloadRecord | null {
    const db = this.dbManager.getDatabase();
    const transaction = db.transaction(() => {
      const queuedDownload = db.prepare(`
        SELECT
          id,
          url,
          url_id as urlId,
          title,
          status,
          progress,
          file_path as filePath,
          error_message as errorMessage,
          start_time as startTime,
          end_time as endTime,
          created_at as createdAt
        FROM downloads
        WHERE status = 'queued' ORDER BY id ASC LIMIT 1
      `).get() as DownloadRecord | undefined;

      if (queuedDownload) {
        db.prepare(
          `UPDATE downloads SET status = 'pending' WHERE id = ?`
        ).run(queuedDownload.id);
        return queuedDownload;
      }
      return null;
    });

    try {
      const result = transaction();
      if (result) {
        this.emit('download-updated', result);
        return result;
      }
      return null;
    } catch (error) {
      console.error('Failed to pop next queued download:', error);
      return null;
    }
  }
}