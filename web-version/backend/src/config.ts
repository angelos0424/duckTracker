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
  ytDlpExtraArgs?: string;
}

export interface BinaryRunnerConfig {
  type: 'binary';
  ytDlpBinary: string;
  cookieFilePath?: string;
  chromePath?: string;
  ytDlpExtraArgs?: string;
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
  historyWsPath: string;
  qualityLimit: number | null;
  checkFormatList: boolean;
  auth: AuthConfig | null;
  runner: RunnerConfig;
}

export interface AuthConfig {
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  publicOrigin: string;
  scopes: string[];
  sessionSecret: string;
  sessionCookieName: string;
  flowCookieName: string;
  sessionTtlSeconds: number;
  cookieSecure: boolean;
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
    const ytDlpExtraArgs = process.env.YT_DLP_EXTRA_ARGS || '';

    return {
      type: 'docker',
      dockerBin,
      dockerImage,
      dockerCommand,
      volumesFrom,
      cookieFilePath,
      chromePath,
      ytDlpExtraArgs,
      workDir: downloadDir
    };
  }

  return {
    type: 'binary',
    ytDlpBinary: process.env.YT_DLP_BINARY || 'yt-dlp',
    cookieFilePath: process.env.COOKIE_FILE_PATH || undefined,
    chromePath: process.env.CHROME_PROFILE_PATH || undefined,
    ytDlpExtraArgs: process.env.YT_DLP_EXTRA_ARGS || undefined,
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalised = value.trim().toLowerCase();
  if (normalised === 'true') {
    return true;
  }
  if (normalised === 'false') {
    return false;
  }

  return fallback;
}

function buildDiscoveryUrl(baseUrl: string, applicationSlug: string): string {
  const base = new URL(baseUrl);
  base.pathname = `/application/o/${applicationSlug}/.well-known/openid-configuration`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

function loadAuthConfig(): AuthConfig | null {
  const explicitDiscoveryUrl = process.env.AUTHENTIK_DISCOVERY_URL?.trim();
  const baseUrl = process.env.AUTHENTIK_BASE_URL?.trim();
  const applicationSlug = process.env.AUTHENTIK_APPLICATION_SLUG?.trim();
  const clientId = process.env.AUTHENTIK_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET?.trim();
  const publicOrigin = process.env.AUTHENTIK_PUBLIC_ORIGIN?.trim();
  const sessionSecret = (process.env.AUTH_SESSION_SECRET || process.env.AUTHENTIK_CLIENT_SECRET || '').trim();

  const discoveryUrl =
    explicitDiscoveryUrl ||
    (baseUrl && applicationSlug ? buildDiscoveryUrl(baseUrl, applicationSlug) : '');

  const hasAnyAuthSetting = [
    explicitDiscoveryUrl,
    baseUrl,
    applicationSlug,
    clientId,
    clientSecret,
    publicOrigin,
    process.env.AUTH_SESSION_SECRET
  ].some((value) => typeof value === 'string' && value.trim().length > 0);

  if (!hasAnyAuthSetting) {
    return null;
  }

  const missing: string[] = [];
  if (!discoveryUrl) missing.push('AUTHENTIK_DISCOVERY_URL or AUTHENTIK_BASE_URL + AUTHENTIK_APPLICATION_SLUG');
  if (!clientId) missing.push('AUTHENTIK_CLIENT_ID');
  if (!clientSecret) missing.push('AUTHENTIK_CLIENT_SECRET');
  if (!publicOrigin) missing.push('AUTHENTIK_PUBLIC_ORIGIN');
  if (!sessionSecret) missing.push('AUTH_SESSION_SECRET');

  if (missing.length > 0) {
    throw new Error(`Missing authentik configuration: ${missing.join(', ')}`);
  }

  const resolvedDiscoveryUrl: string = discoveryUrl ?? '';
  const resolvedClientId: string = clientId ?? '';
  const resolvedClientSecret: string = clientSecret ?? '';
  const resolvedPublicOrigin: string = publicOrigin ?? '';
  const resolvedSessionSecret: string = sessionSecret ?? '';
  const publicUrl = new URL(resolvedPublicOrigin);
  const sessionTtlSeconds = parseInteger(process.env.AUTH_SESSION_TTL_SECONDS, 12 * 60 * 60);
  const rawScopes = process.env.AUTHENTIK_SCOPES || 'openid profile email';
  const scopes = rawScopes
    .split(/[\s,]+/u)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  return {
    discoveryUrl: resolvedDiscoveryUrl,
    clientId: resolvedClientId,
    clientSecret: resolvedClientSecret,
    publicOrigin: publicUrl.toString(),
    scopes: scopes.length > 0 ? scopes : ['openid', 'profile', 'email'],
    sessionSecret: resolvedSessionSecret,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME || 'ducktracker_auth',
    flowCookieName: process.env.AUTH_FLOW_COOKIE_NAME || 'ducktracker_auth_flow',
    sessionTtlSeconds,
    cookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, publicUrl.protocol === 'https:')
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
  const historyWsPath = process.env.HISTORY_WS_PATH || '/history/ws';

  const qualityLimit = normaliseQuality(process.env.DOWNLOAD_QUALITY);

  const format = process.env.DOWNLOAD_FORMAT || buildFormat(DEFAULT_FORMAT, qualityLimit);
  const template = process.env.OUTPUT_TEMPLATE || DEFAULT_TEMPLATE;
  const checkFormatList = process.env.CHECK_FORMAT_LIST?.toLowerCase() === "true" || false;
  const auth = loadAuthConfig();


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
    historyWsPath,
    qualityLimit,
    checkFormatList,
    auth,
    runner: buildRunner(downloadDir)
  };
}
