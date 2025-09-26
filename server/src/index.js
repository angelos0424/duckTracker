const http = require('node:http');
const url = require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./config');
const { DownloadManager } = require('./download-manager');
const { handleUpgrade } = require('./websocket-server');
const {
  initDatabase,
  ensureUrlIds,
  collectServerOnlyUrlIds,
  searchDownloads,
  getDownloadState,
  deleteDownloads
} = require('./database');
const { renderHistoryPage } = require('./history-page');

const config = loadConfig();
initDatabase(config.dbPath);
const downloadManager = new DownloadManager(config);
const websocketClients = new Set();

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function htmlResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8'
  });
  res.end(body);
}

function handleOptions(req, res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    let rawData = '';
    req.on('data', (chunk) => {
      rawData += chunk;
      if (rawData.length > 5 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!rawData) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(rawData);
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of websocketClients) {
    client.send(payload);
  }
}

function isPathInside(baseDir, candidatePath) {
  const relative = path.relative(baseDir, candidatePath);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isValidUrl(candidate) {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function deriveUrlIdFromUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.searchParams.has('list')) {
      return parsed.searchParams.get('list');
    }

    const pathname = parsed.pathname || '';
    const shortsMatch = pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/u);
    if (shortsMatch && shortsMatch[1]) {
      return shortsMatch[1];
    }

    const watchId = parsed.searchParams.get('v');
    if (watchId) {
      return watchId;
    }

    const youtuMatch = pathname.match(/\/([a-zA-Z0-9_-]{11})$/u);
    if (parsed.hostname === 'youtu.be' && youtuMatch && youtuMatch[1]) {
      return youtuMatch[1];
    }

    return parsed.href;
  } catch (error) {
    return null;
  }
}

function handleWebSocketMessage(ws, rawMessage) {
  try {
    const parsed = JSON.parse(rawMessage);

    if (parsed.type === 'sync-history') {
      const incoming = Array.isArray(parsed.data.data) ? parsed.data.data : [];
      const ensured = ensureUrlIds(incoming);
      const serverOnly = collectServerOnlyUrlIds(ensured);

      ws.send(JSON.stringify({ type: 'sync-history', data: serverOnly }));
      return;
    }
  } catch (error) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message payload' }));
  }
}

downloadManager.on('state', (state) => {
  broadcast({ type: 'download', payload: state });
});

downloadManager.on('finished', (info) => {
  broadcast({ type: 'download-finished', payload: info });
});

function sendCurrentState(res) {
  const list = downloadManager.getStateList();
  jsonResponse(res, 200, list);
}

async function handleDownload(req, res) {
  try {
    const body = await collectRequestBody(req);
    const { url: targetUrl, urlId, title } = body;

    if (!targetUrl || !urlId) {
      jsonResponse(res, 400, { error: 'url and urlId are required' });
      return;
    }

    const existing = downloadManager.getState(urlId);
    if (existing && ['downloading', 'queued'].includes(existing.status)) {
      jsonResponse(res, 200, existing);
      return;
    }

    const scheduleResult = downloadManager.schedule({ url: targetUrl, urlId, title: title || '' });
    const updatedState = downloadManager.getState(urlId);
    jsonResponse(res, 200, {
      ...updatedState,
      queued: scheduleResult.queued
    });
  } catch (error) {
    jsonResponse(res, 500,  { error: error.message });
  }
}

async function handleHistoryDownloadRequest(req, res) {
  try {
    const body = await collectRequestBody(req);
    const { url: targetUrl } = body;

    if (!targetUrl || typeof targetUrl !== 'string' || !isValidUrl(targetUrl)) {
      jsonResponse(res, 400, { error: 'A valid URL is required.' });
      return;
    }

    const derivedId = deriveUrlIdFromUrl(targetUrl);
    if (!derivedId) {
      jsonResponse(res, 400, { error: 'Could not determine URL identifier.' });
      return;
    }

    const existing = downloadManager.getState(derivedId);
    if (existing && ['downloading', 'queued'].includes(existing.status)) {
      jsonResponse(res, 200, existing);
      return;
    }

    const scheduleResult = downloadManager.schedule({ url: targetUrl, urlId: derivedId, title: '' });
    const updatedState = downloadManager.getState(derivedId) || {
      url: targetUrl,
      urlId: derivedId,
      status: scheduleResult.queued ? 'queued' : 'downloading',
      percent: 0
    };
    jsonResponse(res, 200, {
      ...updatedState,
      queued: scheduleResult.queued
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
}

async function handleHistoryDelete(req, res, urlId) {
  try {
    if (!urlId) {
      jsonResponse(res, 400, { error: 'urlId is required' });
      return;
    }

    const existingState = downloadManager.getState(urlId);
    if (existingState && ['downloading', 'queued'].includes(existingState.status)) {
      downloadManager.stop(urlId);
    }

    const deleted = deleteDownloads([urlId]);
    if (!deleted || deleted.length === 0) {
      jsonResponse(res, 404, { error: 'Record not found' });
      return;
    }

    const results = await Promise.all(deleted.map(async ({ filePath, urlId: deletedId }) => {
      if (!filePath) {
        return { urlId: deletedId, fileRemoved: false };
      }

      const resolved = path.resolve(filePath);
      if (!isPathInside(config.downloadDir, resolved)) {
        return { urlId: deletedId, fileRemoved: false, reason: 'outside-download-dir' };
      }

      try {
        await fs.promises.unlink(resolved);
        return { urlId: deletedId, fileRemoved: true };
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          return { urlId: deletedId, fileRemoved: false, reason: 'not-found' };
        }
        return { urlId: deletedId, fileRemoved: false, reason: 'unlink-failed' };
      }
    }));

    jsonResponse(res, 200, { success: true, results });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
}

function handleHistoryFileDownload(req, res, urlId) {
  try {
    if (!urlId) {
      jsonResponse(res, 400, { error: 'urlId is required' });
      return;
    }

    const record = getDownloadState(urlId);
    if (!record || !record.filePath) {
      jsonResponse(res, 404, { error: 'File not available' });
      return;
    }

    const resolved = path.resolve(record.filePath);
    if (!isPathInside(config.downloadDir, resolved)) {
      jsonResponse(res, 403, { error: 'File outside of download directory' });
      return;
    }

    fs.stat(resolved, (statError, stats) => {
      if (statError) {
        jsonResponse(res, statError.code === 'ENOENT' ? 404 : 500, { error: 'File not found' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(resolved))}"`
      });

      const stream = fs.createReadStream(resolved);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      });
      stream.pipe(res);
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
}

async function handleStop(req, res) {
  try {
    const body = await collectRequestBody(req);
    const { urlId } = body;
    if (!urlId) {
      jsonResponse(res, 400, { error: 'urlId is required' });
      return;
    }

    const success = downloadManager.stop(urlId);
    if (!success) {
      jsonResponse(res, 404, { error: 'Download not found' });
      return;
    }

    const state = downloadManager.getState(urlId);
    jsonResponse(res, 200, state || { status: 'stop', urlId });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
}

async function handleSaveHistory(req, res) {
  try {
    await collectRequestBody(req);
    jsonResponse(res, 200, { success: true });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function handleHistory(req, res, query) {
  const searchTerm = typeof query.search === 'string' ? query.search.trim() : '';
  let page = parseInteger(query.page, 1);
  let pageSize = parseInteger(query.pageSize, 20);
  pageSize = Math.min(pageSize, 100);

  let result = searchDownloads({ searchTerm, page, pageSize });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  if (page > totalPages && result.total > 0) {
    page = totalPages;
    result = searchDownloads({ searchTerm, page, pageSize });
  }

  const html = renderHistoryPage({
    items: result.items,
    total: result.total,
    page,
    pageSize: result.pageSize,
    searchTerm
  });

  htmlResponse(res, 200, html);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '/', true);
  if (req.method === 'OPTIONS') {
    handleOptions(req, res);
    return;
  }

  if (req.method === 'GET' && parsedUrl.pathname === '/history') {
    handleHistory(req, res, parsedUrl.query || {});
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/history/request-download') {
    handleHistoryDownloadRequest(req, res);
    return;
  }

  if (req.method === 'DELETE' && parsedUrl.pathname && parsedUrl.pathname.startsWith('/history/')) {
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length === 2) {
      handleHistoryDelete(req, res, decodeURIComponent(segments[1]));
      return;
    }
  }

  if (req.method === 'GET' && parsedUrl.pathname && parsedUrl.pathname.startsWith('/history/')) {
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length === 3 && segments[2] === 'file') {
      handleHistoryFileDownload(req, res, decodeURIComponent(segments[1]));
      return;
    }
  }

  if (req.method === 'GET' && parsedUrl.pathname === '/downloads') {
    sendCurrentState(res);
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/download') {
    handleDownload(req, res);
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/stop_download') {
    handleStop(req, res);
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/save_history') {
    handleSaveHistory(req, res);
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
});

server.on('upgrade', (request, socket, head) => {
  const ws = handleUpgrade(request, socket, head, websocketClients, config.wsPath);
  if (ws) {
    ws.on('message', (message) => handleWebSocketMessage(ws, message));
  }
});

server.listen(config.httpPort, () => {
  console.log(`[server] Listening on port ${config.httpPort}`);
  console.log(`[server] Download directory: ${config.downloadDir}`);
  console.log(`[server] Max concurrent downloads: ${config.maxConcurrent}`);
  console.log(`[server] Format: ${config.format}`);
  if (config.qualityLimit) {
    console.log(`[server] Quality limit: ${config.qualityLimit}p`);
  }
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});
