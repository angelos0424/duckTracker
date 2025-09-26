const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_DOWNLOAD_DIR = '/downloads';
const DEFAULT_FORMAT = 'bestvideo+bestaudio/best';
const DEFAULT_TEMPLATE = '%(id)s.%(ext)s';
const DEFAULT_YT_DLP_IMAGE = 'ghcr.io/yt-dlp/yt-dlp:latest';
const DEFAULT_DOCKER_BIN = 'docker';

function parseInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normaliseQuality(input) {
  if (!input) return null;
  const match = /(?<height>\d{3,4})/u.exec(input);
  if (!match || !match.groups) return null;
  return Number.parseInt(match.groups.height, 10);
}

function buildFormat(baseFormat, qualityToken) {
  if (!qualityToken) {
    return baseFormat;
  }

  if (baseFormat && baseFormat.includes('{quality}')) {
    return baseFormat.replace(/\{quality\}/gu, String(qualityToken));
  }

  const limit = `[height<=${qualityToken}]`;
  return `bestvideo${limit}+bestaudio/best${limit}`;
}

function buildRunner(downloadDir) {
  const runner = (process.env.YT_DLP_RUNNER || 'docker').toLowerCase();

  if (runner === 'docker') {
    const dockerImage = process.env.YT_DLP_IMAGE || DEFAULT_YT_DLP_IMAGE;
    const dockerBin = process.env.DOCKER_BIN || DEFAULT_DOCKER_BIN;
    const volumesFrom = process.env.SERVER_CONTAINER_NAME || process.env.HOSTNAME || '';
    const dockerCommand = process.env.YT_DLP_COMMAND || 'yt-dlp';
    const cookieFilePath = process.env.COOKIE_FILE_PATH || '';
    const chromePath = process.env.CHROME_PROFILE_PATH || '';

    return {
      type: 'docker',
      dockerBin,
      dockerImage,
      dockerCommand,
      volumesFrom,
      cookieFilePath,
      chromePath,
      workDir: downloadDir
    };
  }

  return {
    type: 'binary',
    ytDlpBinary: process.env.YT_DLP_BINARY || 'yt-dlp',
    cookieFilePath: process.env.COOKIE_FILE_PATH,
    chromePath: process.env.CHROME_PROFILE_PATH
  };
}

function loadConfig() {
  const rawDownloadDir = process.env.DOWNLOAD_DIR || DEFAULT_DOWNLOAD_DIR;
  const downloadDir = path.resolve(rawDownloadDir);

  const rawDbPath = process.env.DB_PATH || path.join('/data', 'tracker.sqlite');
  const dbPath = path.resolve(rawDbPath);

  const maxConcurrent = parseInteger(process.env.MAX_CONCURRENT_DOWNLOADS, 2);
  const httpPort = parseInteger(process.env.PORT || process.env.HTTP_PORT, 8080);
  const wsPath = process.env.WS_PATH || '/';

  const qualityLimit = normaliseQuality(process.env.DOWNLOAD_QUALITY);
  const format = buildFormat(process.env.DOWNLOAD_FORMAT || DEFAULT_FORMAT, qualityLimit);
  const template = process.env.OUTPUT_TEMPLATE || DEFAULT_TEMPLATE;


  const ensureDir = process.env.SKIP_DIR_CREATION !== 'true';
  if (ensureDir) {
    fs.mkdirSync(downloadDir, { recursive: true });
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  return {
    downloadDir,
    dbPath,
    format,
    template,
    maxConcurrent,
    httpPort,
    wsPath,
    qualityLimit,
    runner: buildRunner(downloadDir)
  };
}

module.exports = { loadConfig };
