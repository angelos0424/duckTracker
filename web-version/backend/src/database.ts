import * as path from 'node:path';
import Database, { Database as BetterSqliteDatabase, Statement } from 'better-sqlite3';

export type DownloadStatus =
    | 'check'
    | 'queued'
    | 'downloading'
    | 'completed'
    | 'error'
    | 'stopped';

export interface DownloadPayload {
    urlId: string;
    url: string;
    title?: string;
}

export interface DownloadCompletedPayload extends DownloadPayload {
    filePath?: string;
    fileSizeBytes?: number | null;
}

export interface DownloadErrorPayload extends DownloadPayload {
    error?: string | null;
}

export interface DownloadFilePathPayload {
    urlId: string;
    filePath?: string;
    fileSizeBytes?: number | null;
}

export interface DownloadTitlePayload {
    urlId: string;
    title?: string;
}

export interface DownloadRecordRow {
    urlId: string;
    url: string;
    title: string;
    status: DownloadStatus | string;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
    filePath: string | null;
    fileSizeBytes: number | null;
}

export interface SearchDownloadsInput {
    searchTerm?: string;
    page?: number;
    pageSize?: number;
    statuses?: string[];
}

export interface SearchDownloadsResult {
    total: number;
    page: number;
    pageSize: number;
    items: DownloadRecordRow[];
    statusCounts: Record<string, number>;
}

let instance: BetterSqliteDatabase | null = null;

interface Statements {
    upsertDownload: Statement<DownloadPayload & { status: DownloadStatus; lastError: string | null }>;
    insertIfMissing: Statement;
    setStatus: Statement<{ urlId: string; status: DownloadStatus | string; lastError: string | null }>;
    setFilePath: Statement<{ urlId: string; filePath: string; fileSizeBytes: number | null }>;
    setTitle: Statement<{ urlId: string; title: string }>;
    selectAllIds: Statement<unknown[], { url_id: string }>;
    selectState: Statement<string, DownloadRecordRow | undefined>;
}

let statements: Statements | null = null;

function normaliseFilePathForStorage(filePath?: string | null): string {
    if (!filePath) {
        return '';
    }

    const trimmed = filePath.trim();
    if (!trimmed) {
        return '';
    }

    if (trimmed.includes('/downloads/')) {
        return trimmed.replace('/downloads/', '');
    }

    if (trimmed.includes('\\downloads\\')) {
        return trimmed.replace('\\downloads\\', '');
    }

    return trimmed;
}

function normaliseFileSizeBytes(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return null;
    }

    return Math.floor(numeric);
}

function ensureStatements(db: BetterSqliteDatabase): Statements {
    if (statements) {
        return statements;
    }

    statements = {
        upsertDownload: db.prepare<DownloadPayload & { status: DownloadStatus; lastError: string | null }>(`
      INSERT INTO downloads (url_id, url, title, status, last_error)
      VALUES (@urlId, @url, @title, @status, @lastError)
      ON CONFLICT(url_id) DO UPDATE SET
        url = excluded.url,
        title = excluded.title,
        status = excluded.status,
        last_error = excluded.last_error,
        updated_at = CURRENT_TIMESTAMP
    `),
        insertIfMissing: db.prepare("INSERT INTO downloads (url_id, status) VALUES (?, 'check') ON CONFLICT(url_id) DO NOTHING"),
        setStatus: db.prepare<{ urlId: string; status: DownloadStatus | string; lastError: string | null }>(`
      UPDATE downloads
      SET status = @status,
          last_error = @lastError,
          updated_at = CURRENT_TIMESTAMP
      WHERE url_id = @urlId
    `),
        setFilePath: db.prepare<{ urlId: string; filePath: string; fileSizeBytes: number | null }>(`
      UPDATE downloads
      SET file_path = @filePath,
          file_size_bytes = @fileSizeBytes,
          updated_at = CURRENT_TIMESTAMP
      WHERE url_id = @urlId
    `),
        setTitle: db.prepare<{ urlId: string; title: string }>(`
      UPDATE downloads
      SET title = @title,
          updated_at = CURRENT_TIMESTAMP
      WHERE url_id = @urlId
    `),
        selectAllIds: db.prepare('SELECT url_id FROM downloads'),
        selectState: db.prepare<string, DownloadRecordRow | undefined>(`
      SELECT url_id AS urlId, url, title, status, last_error AS lastError, file_path AS filePath,
             file_size_bytes AS fileSizeBytes,
             created_at AS createdAt, updated_at AS updatedAt
      FROM downloads
      WHERE url_id = ?
    `)
    };

    return statements;
}

export function initDatabase(dbPath: string): BetterSqliteDatabase {
    if (instance) {
        return instance;
    }

    const resolved = path.resolve(dbPath);
    instance = new Database(resolved);
    instance.pragma('journal_mode = WAL');
    instance.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      url_id TEXT PRIMARY KEY,
      url TEXT DEFAULT '',
      title TEXT DEFAULT '',
      status TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      file_path TEXT DEFAULT '',
      file_size_bytes INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
  `);

    const columns = instance.prepare('PRAGMA table_info(downloads)').all() as Array<{ name: string }>;
    const hasFilePath = columns.some((column) => column.name === 'file_path');
    if (!hasFilePath) {
        instance.exec('ALTER TABLE downloads ADD COLUMN file_path TEXT DEFAULT "";');
    }

    const hasFileSize = columns.some((column) => column.name === 'file_size_bytes');
    if (!hasFileSize) {
        instance.exec('ALTER TABLE downloads ADD COLUMN file_size_bytes INTEGER;');
    }

    ensureStatements(instance);

    return instance;
}

function assertDb(): BetterSqliteDatabase {
    if (!instance) {
        throw new Error('Database not initialised');
    }
    return instance;
}

export function recordDownloadStart(payload: DownloadPayload): void {
    const db = assertDb();
    const stmts = ensureStatements(db);
    stmts.upsertDownload.run({
        urlId: payload.urlId,
        url: payload.url,
        title: payload.title || '',
        status: 'downloading',
        lastError: null
    });
}

export function recordDownloadQueued(payload: DownloadPayload): void {
    const db = assertDb();
    const stmts = ensureStatements(db);
    stmts.upsertDownload.run({
        urlId: payload.urlId,
        url: payload.url,
        title: payload.title || '',
        status: 'queued',
        lastError: null
    });
}

export function recordDownloadCompleted(payload: DownloadCompletedPayload): void {
    const db = assertDb();
    const stmts = ensureStatements(db);
    const filePath = normaliseFilePathForStorage(payload.filePath || '');
    const fileSizeBytes = normaliseFileSizeBytes(payload.fileSizeBytes);

    stmts.setStatus.run({
        urlId: payload.urlId,
        status: 'completed',
        lastError: null
    });
    stmts.setFilePath.run({ urlId: payload.urlId, filePath, fileSizeBytes });
}

export function recordDownloadTitle(payload: DownloadTitlePayload): void {
    if (!payload.title) {
        return;
    }
    const db = assertDb();
    const stmts = ensureStatements(db);
    stmts.setTitle.run({
        urlId: payload.urlId,
        title: payload.title
    });
}

export function recordDownloadFilePath(payload: DownloadFilePathPayload): void {
    if (!payload.filePath) {
        return;
    }
    const db = assertDb();
    const stmts = ensureStatements(db);
    const filePath = normaliseFilePathForStorage(payload.filePath);
    const fileSizeBytes = normaliseFileSizeBytes(payload.fileSizeBytes);
    stmts.setFilePath.run({
        urlId: payload.urlId,
        filePath,
        fileSizeBytes
    });
}

export function clearDownloadFilePath(urlId: string): void {
    if (!urlId) {
        return;
    }

    const db = assertDb();
    const stmts = ensureStatements(db);
    stmts.setFilePath.run({ urlId, filePath: '', fileSizeBytes: null });
}

export function recordDownloadError(payload: DownloadErrorPayload): void {
    const db = assertDb();
    const stmts = ensureStatements(db);
    stmts.setStatus.run({
        urlId: payload.urlId,
        status: 'error',
        lastError: payload.error ?? null
    });
}

export function recordDownloadStopped(payload: DownloadErrorPayload): void {
    recordDownloadError({ ...payload, error: payload.error || 'stopped' });
}

export function ensureUrlIds(urlIds: unknown[]): string[] {
    const db = assertDb();

    if (!Array.isArray(urlIds) || urlIds.length === 0) {
        return [];
    }

    const unique = Array.from(new Set(urlIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)));
    if (unique.length === 0) {
        return [];
    }

    const stmts = ensureStatements(db);
    const insert = stmts.insertIfMissing;
    const insertMany = db.transaction((ids: string[]) => {
        ids.forEach((id: string) => insert.run(id));
    });

    insertMany(unique);

    return unique;
}

export function collectServerOnlyUrlIds(incomingIds: string[]): string[] {
    const db = assertDb();

    const stmts = ensureStatements(db);
    const existing = stmts.selectAllIds.all().map((row) => row.url_id);

    if (!incomingIds || incomingIds.length === 0) {
        return existing;
    }

    const incomingSet = new Set(incomingIds);
    return existing.filter((id: string) => !incomingSet.has(id));
}

export function getDownloadState(urlId: string): DownloadRecordRow | null {
    const db = assertDb();
    const stmts = ensureStatements(db);
    console.log('getDownloadState...', stmts.selectState.get(urlId))
    return stmts.selectState.get(urlId) ?? null;
}

export function deleteDownloads(urlIds: string[]): Array<{ urlId: string; filePath: string | null }>
{
    const db = assertDb();

    if (!Array.isArray(urlIds) || urlIds.length === 0) {
        return [];
    }

    const uniqueIds = Array.from(new Set(urlIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
    if (uniqueIds.length === 0) {
        return [];
    }

    const placeholders = uniqueIds.map(() => '?').join(',');
    const selectStmt = db.prepare(`
    SELECT url_id AS urlId, file_path AS filePath
    FROM downloads
    WHERE url_id IN (${placeholders})
  `);
    const deleteStmt = db.prepare(`
    DELETE FROM downloads
    WHERE url_id IN (${placeholders})
  `);

    const transaction = db.transaction((ids: string[]) => {
        const rows = selectStmt.all(...ids) as Array<{ urlId: string; filePath: string | null }>;
        deleteStmt.run(...ids);
        return rows;
    });

    return transaction(uniqueIds) as Array<{ urlId: string; filePath: string | null }>;
}

export function searchDownloads({
    searchTerm = '',
    page = 1,
    pageSize = 20,
    statuses = []
}: SearchDownloadsInput): SearchDownloadsResult {
    const db = assertDb();

    const safePage = Number.isInteger(page) && page && page > 0 ? page : 1;
    const safePageSize = Number.isInteger(pageSize) && pageSize && pageSize > 0 ? Math.min(pageSize, 100) : 20;
    const offset = (safePage - 1) * safePageSize;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (searchTerm && typeof searchTerm === 'string') {
        params.search = `%${searchTerm.trim()}%`;
        conditions.push('(url_id LIKE @search OR title LIKE @search)');
    }

    const statusList = Array.isArray(statuses)
        ? Array.from(
              new Set(
                  statuses
                      .map((status) => (typeof status === 'string' ? status.trim() : ''))
                      .filter((status) => status.length > 0)
              )
          )
        : [];

    if (statusList.length > 0) {
        const placeholders = statusList.map((_status, index) => `@status${index}`);
        conditions.push(`status IN (${placeholders.join(',')})`);
        statusList.forEach((status, index) => {
            params[`status${index}`] = status;
        });
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM downloads
    ${whereClause}
  `);
    const totalRow = totalStmt.get(params) as { total: number };
    const total = totalRow?.total ?? 0;

    const itemsStmt = db.prepare(`
    SELECT
      url_id AS urlId,
      url,
      title,
      status,
      last_error AS lastError,
      created_at AS createdAt,
      updated_at AS updatedAt,
      file_path AS filePath,
      file_size_bytes AS fileSizeBytes
    FROM downloads
    ${whereClause}
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC
    LIMIT @limit OFFSET @offset
  `);

    const items = itemsStmt.all({ ...params, limit: safePageSize, offset }) as DownloadRecordRow[];

    const statusCountsStmt = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM downloads
    ${whereClause}
    GROUP BY status
  `);

    const statusCountsRows = statusCountsStmt.all(params) as Array<{ status: string; count: number }>;
    const statusCounts = statusCountsRows.reduce<Record<string, number>>((accumulator, row) => {
        if (!row || typeof row.status !== 'string') {
            return accumulator;
        }
        const count = typeof row.count === 'number' && Number.isFinite(row.count) ? row.count : 0;
        accumulator[row.status] = count;
        return accumulator;
    }, {});

    return {
        total,
        page: safePage,
        pageSize: safePageSize,
        items,
        statusCounts
    };
}
