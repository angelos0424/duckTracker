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
      INSERT INTO downloads (url_id, url, title, status, file_path, last_error)
      VALUES (@urlId, @url, @title, @status, @filePath, @lastError)
      ON CONFLICT(url_id) DO UPDATE SET
        url = excluded.url,
        title = excluded.title,
        status = excluded.status,
        file_path = excluded.file_path,
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
          file_path = COALESCE(@filePath, file_path),
          last_error = @lastError,
          updated_at = CURRENT_TIMESTAMP
      WHERE url_id = @urlId
    `),
    selectAllIds: db.prepare('SELECT url_id FROM downloads'),
    selectState: db.prepare(`
      SELECT url_id AS urlId, url, title, status, file_path AS filePath, last_error AS lastError
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
      file_path TEXT,
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
    filePath: payload.filePath || null,
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
    filePath: payload.filePath || null,
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
    filePath: payload.filePath || null,
    lastError: null
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
    filePath: payload.filePath || null,
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

module.exports = {
  initDatabase,
  recordDownloadQueued,
  recordDownloadStart,
  recordDownloadCompleted,
  recordDownloadError,
  recordDownloadStopped,
  ensureUrlIds,
  collectServerOnlyUrlIds,
  getDownloadState
};

