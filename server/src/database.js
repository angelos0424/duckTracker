const path = require('node:path');
const Database = require('better-sqlite3');

let instance;
let statements;

function ensureStatements(db) {
  if (statements) {
    return statements;
  }

  statements = {
    upsertDownload: db.prepare(`
      INSERT INTO downloads (url_id, url, title, status, last_error)
      VALUES (@urlId, @url, @title, @status, @lastError)
      ON CONFLICT(url_id) DO UPDATE SET
        url = excluded.url,
        title = excluded.title,
        status = excluded.status,
        last_error = excluded.last_error,
        updated_at = CURRENT_TIMESTAMP
    `),
    insertIfMissing: db.prepare(`
      INSERT INTO downloads (url_id, status)
      VALUES (?, 'check')
      ON CONFLICT(url_id) DO NOTHING
    `),
    setStatus: db.prepare(`
      UPDATE downloads
      SET status = @status,
          last_error = @lastError,
          updated_at = CURRENT_TIMESTAMP
      WHERE url_id = @urlId
    `),
    setTitle: db.prepare(`
      UPDATE downloads
      SET title = @title,
          updated_at = CURRENT_TIMESTAMP
      WHERE url_id = @urlId
    `),
    selectAllIds: db.prepare('SELECT url_id FROM downloads'),
    selectState: db.prepare(`
      SELECT url_id AS urlId, url, title, status, last_error AS lastError
      FROM downloads
      WHERE url_id = ?
    `)
  };

  return statements;
}

function initDatabase(dbPath) {
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
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
  `);

  ensureStatements(instance);

  return instance;
}

function recordDownloadStart(payload) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  const stmts = ensureStatements(db);
  stmts.upsertDownload.run({
    urlId: payload.urlId,
    url: payload.url,
    title: payload.title || '',
    status: 'downloading',
    lastError: null
  });
}

function recordDownloadQueued(payload) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  const stmts = ensureStatements(db);
  stmts.upsertDownload.run({
    urlId: payload.urlId,
    url: payload.url,
    title: payload.title || '',
    status: 'queued',
    lastError: null
  });
}

function recordDownloadCompleted(payload) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  const stmts = ensureStatements(db);
  stmts.setStatus.run({
    urlId: payload.urlId,
    status: 'completed',
    lastError: null
  });
}

function recordDownloadTitle(payload) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  if (!payload.title) {
    return;
  }

  const stmts = ensureStatements(db);
  stmts.setTitle.run({
    urlId: payload.urlId,
    title: payload.title
  });
}

function recordDownloadError(payload) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  const stmts = ensureStatements(db);
  stmts.setStatus.run({
    urlId: payload.urlId,
    status: 'error',
    lastError: payload.error || null
  });
}

function recordDownloadStopped(payload) {
  recordDownloadError({ ...payload, error: payload.error || 'stopped' });
}

function ensureUrlIds(urlIds) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  if (!Array.isArray(urlIds) || urlIds.length === 0) {
    return [];
  }

  const unique = Array.from(new Set(urlIds.filter((item) => typeof item === 'string' && item.trim())));
  console.log('ensureUrlIds', unique.length)
  if (unique.length === 0) {
    return [];
  }

  const stmts = ensureStatements(db);
  const insert = stmts.insertIfMissing;
  const insertMany = db.transaction((ids) => {
    ids.forEach((id) => insert.run(id));
  });

  insertMany(unique);

  return unique;
}

function collectServerOnlyUrlIds(incomingIds) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  const stmts = ensureStatements(db);
  const existing = stmts.selectAllIds.all().map((row) => row.url_id);

  if (!incomingIds || incomingIds.length === 0) {
    return existing;
  }

  const incomingSet = new Set(incomingIds);
  return existing.filter((id) => !incomingSet.has(id));
}

function getDownloadState(urlId) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  const stmts = ensureStatements(db);
  return stmts.selectState.get(urlId) || null;
}

function searchDownloads({ searchTerm = '', page = 1, pageSize = 20 }) {
  const db = instance;
  if (!db) {
    throw new Error('Database not initialised');
  }

  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;
  const offset = (safePage - 1) * safePageSize;

  const conditions = [];
  const params = {};

  if (searchTerm && typeof searchTerm === 'string') {
    params.search = `%${searchTerm.trim()}%`;
    conditions.push('(url_id LIKE @search OR title LIKE @search)');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM downloads
    ${whereClause}
  `);
  const total = totalStmt.get(params).total;

  const itemsStmt = db.prepare(`
    SELECT
      url_id AS urlId,
      url,
      title,
      status,
      last_error AS lastError,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM downloads
    ${whereClause}
    ORDER BY datetime(created_at) DESC, datetime(updated_at) DESC
    LIMIT @limit OFFSET @offset
  `);

  const items = itemsStmt.all({ ...params, limit: safePageSize, offset });

  return {
    total,
    page: safePage,
    pageSize: safePageSize,
    items
  };
}

module.exports = {
  initDatabase,
  recordDownloadQueued,
  recordDownloadStart,
  recordDownloadCompleted,
  recordDownloadError,
  recordDownloadStopped,
  recordDownloadTitle,
  ensureUrlIds,
  collectServerOnlyUrlIds,
  getDownloadState,
  searchDownloads
};
