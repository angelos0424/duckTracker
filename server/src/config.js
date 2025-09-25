const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_DOWNLOAD_DIR = '/downloads';
const DEFAULT_FORMAT = 'bestvideo+bestaudio/best';
const DEFAULT_TEMPLATE = '%(title)s.%(ext)s';

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

function loadConfig() {
  const rawDownloadDir = process.env.DOWNLOAD_DIR || DEFAULT_DOWNLOAD_DIR;
  const downloadDir = path.resolve(rawDownloadDir);

  const maxConcurrent = parseInteger(process.env.MAX_CONCURRENT_DOWNLOADS, 2);
  const httpPort = parseInteger(process.env.PORT || process.env.HTTP_PORT, 8080);
  const wsPath = process.env.WS_PATH || '/';

  const qualityLimit = normaliseQuality(process.env.DOWNLOAD_QUALITY);
  const format = buildFormat(process.env.DOWNLOAD_FORMAT || DEFAULT_FORMAT, qualityLimit);
  const template = process.env.OUTPUT_TEMPLATE || DEFAULT_TEMPLATE;
  const ytDlpBinary = process.env.YT_DLP_BINARY || 'yt-dlp';

  const ensureDir = process.env.SKIP_DIR_CREATION !== 'true';
  if (ensureDir) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  return {
    downloadDir,
    format,
    template,
    maxConcurrent,
    httpPort,
    wsPath,
    ytDlpBinary,
    qualityLimit
  };
}

module.exports = { loadConfig };
