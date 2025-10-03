import * as path from 'node:path';
import * as fs from 'node:fs';

const DEFAULT_DOWNLOAD_DIR = '/downloads';
const DEFAULT_FORMAT = 'bestvideo+bestaudio/best';
const DEFAULT_TEMPLATE = '%(id)s.%(ext)s';
const DEFAULT_YT_DLP_IMAGE = 'ghcr.io/yt-dlp/yt-dlp:latest';
const DEFAULT_DOCKER_BIN = 'docker';

type RunnerType = 'docker' | 'binary';

export interface DockerRunnerConfig {
  type: 'docker';
  dockerBin: string;
  dockerImage: string;
  dockerCommand: string;
  volumesFrom: string;
  cookieFilePath: string;
  chromePath: string;
  workDir: string;
}

export interface BinaryRunnerConfig {
  type: 'binary';
  ytDlpBinary: string;
  cookieFilePath?: string;
  chromePath?: string;
}

export type RunnerConfig = DockerRunnerConfig | BinaryRunnerConfig;

export interface ServerConfig {
  downloadDir: string;
  dbPath: string;
  format: string;
  template: string;
  maxConcurrent: number;
  httpPort: number;
  wsPath: string;
  qualityLimit: number | null;
  checkFormatList: boolean;
  runner: RunnerConfig;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normaliseQuality(input: string | undefined): number | null {
  if (!input) return null;
  const match = /(?<height>\d{3,4})/u.exec(input);
  if (!match || !match.groups) return null;
  return Number.parseInt(match.groups.height, 10);
}

function buildFormat(baseFormat: string, qualityToken: number | null): string {
  if (!qualityToken) {
    return baseFormat;
  }

  if (baseFormat && baseFormat.includes('{quality}')) {
    return baseFormat.replace(/\{quality\}/gu, String(qualityToken));
  }

  const limit = `[height<=${qualityToken}]`;
  return `bestvideo${limit}+bestaudio/best${limit}`;
}

function buildRunner(downloadDir: string): RunnerConfig {
  const runner = (process.env.YT_DLP_RUNNER || 'docker').toLowerCase() as RunnerType;

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
    cookieFilePath: process.env.COOKIE_FILE_PATH || undefined,
    chromePath: process.env.CHROME_PROFILE_PATH || undefined
  };
}

export function loadConfig(): ServerConfig {
  const rawDownloadDir = process.env.DOWNLOAD_DIR || DEFAULT_DOWNLOAD_DIR;
  const downloadDir = path.resolve(rawDownloadDir);

  const rawDbPath = process.env.DB_PATH || path.join('/data', 'tracker.sqlite');
  const dbPath = path.resolve(rawDbPath);

  const maxConcurrent = parseInteger(process.env.MAX_CONCURRENT_DOWNLOADS, 2);
  const httpPort = parseInteger(process.env.PORT || process.env.HTTP_PORT, 8080);
  const wsPath = process.env.WS_PATH || '/';

  const qualityLimit = normaliseQuality(process.env.DOWNLOAD_QUALITY);

  const format = process.env.DOWNLOAD_FORMAT || buildFormat(DEFAULT_FORMAT, qualityLimit);
  const template = process.env.OUTPUT_TEMPLATE || DEFAULT_TEMPLATE;
  const checkFormatList = process.env.CHECK_FORMAT_LIST?.toLowerCase() === "true" || false;


  const ensureDir = process.env.SKIP_DIR_CREATION !== 'true';
  if (ensureDir) {
    fs.mkdirSync(downloadDir, { recursive: true });
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  return {
    downloadDir,
    dbPath,
    format,
  const checkFormatList = process.env.CHECK_FORMAT_LIST?.toLowerCase() === "true";
    maxConcurrent,
    httpPort,
    wsPath,
    qualityLimit,
    checkFormatList,
    runner: buildRunner(downloadDir)
  };
}
