const http = require('node:http');
const url = require('node:url');
const { loadConfig } = require('./config');
const { DownloadManager } = require('./download-manager');
const { handleUpgrade } = require('./websocket-server');
const {
  initDatabase,
  ensureUrlIds,
  collectServerOnlyUrlIds
} = require('./database');

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

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '/', true);
  if (req.method === 'OPTIONS') {
    handleOptions(req, res);
    return;
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
