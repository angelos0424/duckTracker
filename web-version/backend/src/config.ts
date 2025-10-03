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
