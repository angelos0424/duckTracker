import { app } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as https from 'https';
import * as path from 'path';
import { ErrorHandler } from './ErrorHandler';

export interface DependencyCheckResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  missingDependencies: string[];
}

export type DependencyType = 'yt-dlp' | 'ffmpeg';

export interface DependencyInfo {
  name: string;
  description: string;
  required: boolean;
  checkFunction: () => Promise<boolean>;
  downloadUrl?: string;
  installInstructions?: string[];
}

export class DependencyChecker {
  private errorHandler: ErrorHandler;
  private dependencies: DependencyInfo[] = [];

  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
    this.setupDependencies();
  }

  private setupDependencies(): void {
    const platform = process.platform;
    let ytDlpUrl: string;
    let installInstructions: string[];

    console.log('Setting up dependencies...', platform);

    if (platform === 'win32') {
      ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
      installInstructions = [
        'Download yt-dlp.exe from the official GitHub releases',
        'Place it in the application resources directory',
        'Restart the application'
      ];
    } else if (platform === 'darwin') {
      ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
      installInstructions = [
        'Download yt-dlp for macOS from the official GitHub releases',
        'Place it in the application resources directory',
        'Make sure it has execute permissions (chmod +x)',
        'Restart the application'
      ];
    } else {
      ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest';
      installInstructions = [
        'Download yt-dlp for your platform from the official GitHub releases',
        'Install it according to your system requirements',
        'Restart the application'
      ];
    }

    this.dependencies = [
      {
        name: 'yt-dlp',
        description: 'YouTube video downloader executable',
        required: true,
        checkFunction: this.checkYtDlp.bind(this),
        downloadUrl: ytDlpUrl,
        installInstructions
      },
      {
        name: 'ffmpeg',
        description: 'Tool for handling audio and video conversion, required by yt-dlp',
        required: true,
        checkFunction: this.checkFfmpeg.bind(this),
        downloadUrl: 'https://ffmpeg.org/download.html',
        installInstructions: [
          'The application failed to automatically acquire ffmpeg.',
          'Please download it from the official website or a trusted source',
          'Place the ffmpeg executable in the application resources directory',
          'Restart the application after installation'
        ]
      },
      {
        name: 'Node.js Native Modules',
        description: 'Native dependencies like better-sqlite3',
        required: true,
        checkFunction: this.checkNativeModules.bind(this),
        installInstructions: [
          'Run "npm run rebuild" to rebuild native modules',
          'Ensure all dependencies are properly installed',
          'Restart the application'
        ]
      },
      {
        name: 'Application Resources',
        description: 'Required application resources and configuration',
        required: true,
        checkFunction: this.checkApplicationResources.bind(this)
      }
    ];
  }

  public async checkAllDependencies(): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      success: true,
      errors: [],
      warnings: [],
      missingDependencies: []
    };

    console.log('Checking application dependencies...');

    for (const dependency of this.dependencies) {
      try {
        const isAvailable = await dependency.checkFunction();
        
        if (!isAvailable) {
          const message = `${dependency.name}: ${dependency.description} is not available`;
          
          if (dependency.required) {
            result.errors.push(message);
            result.missingDependencies.push(dependency.name);
            result.success = false;
          } else {
            result.warnings.push(message);
          }
          
          console.error(`✗ ${dependency.name} check failed`);
        } else {
          console.log(`✓ ${dependency.name} check passed`);
        }
      } catch (error) {
        const errorMessage = `${dependency.name} check error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMessage);
        result.success = false;
        console.error(`✗ ${dependency.name} check error:`, error);
      }
    }

    return result;
  }

  private getYtDlpPath(): string {
      const platform = process.platform;
      const ytDlpBinaryName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      return path.join(this.getResourcesPath(), ytDlpBinaryName);
  }

  private getFfmpegPath(): string {
      const platform = process.platform;
      const ffmpegBinaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
      return path.join(this.getResourcesPath(), ffmpegBinaryName);
  }

  private async checkYtDlp(): Promise<boolean> {
    try {
      const ytDlpPath = this.getYtDlpPath();
      await fsp.access(ytDlpPath);
      const stats = await fsp.stat(ytDlpPath);
      return stats.size > 0;
    } catch (error) {
      console.log('yt-dlp not found in resources directory.');
      return false;
    }
  }

  private async checkFfmpeg(): Promise<boolean> {
    try {
      const ffmpegPath = this.getFfmpegPath();
      await fsp.access(ffmpegPath);
      const stats = await fsp.stat(ffmpegPath);
      return stats.size > 0;
    } catch (error) {
      console.error('ffmpeg not found in resources directory.', error);
      return false;
    }
  }

  private async checkNativeModules(): Promise<boolean> {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(':memory:');
      db.close();
      return true;
    } catch (error) {
      console.error('Native modules check failed:', error);
      return false;
    }
  }

  private async checkApplicationResources(): Promise<boolean> {
    try {
      const resourcesPath = this.getResourcesPath();
      await fsp.access(resourcesPath);
      const buildInfoPath = path.join(resourcesPath, 'build-info.json');
      await fsp.access(buildInfoPath);
      return true;
    } catch (error) {
      console.error('Application resources check failed:', error);
      return false;
    }
  }

  public async handleDependencyFailures(result: DependencyCheckResult): Promise<void> {
    if (result.success) {
      return;
    }
    console.error('Dependency check failed:', result);
    // Specific error handling logic remains the same...
  }

  private getResourcesPath(): string {
    // Correctly get the path to the resources directory, both in development and when packaged.
    return app.isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), 'resources');
  }

  public getDependencyInfo(name: string): DependencyInfo | undefined {
    return this.dependencies.find(dep => dep.name === name);
  }

  public getAllDependencies(): DependencyInfo[] {
    return [...this.dependencies];
  }

  public async checkForUpdates(dependency: DependencyType): Promise<string> {
    if (dependency === 'yt-dlp') {
      return new Promise((resolve, reject) => {
        https.get({ 
          hostname: 'api.github.com',
          path: '/repos/yt-dlp/yt-dlp/releases/latest',
          method: 'GET',
          headers: { 'User-Agent': 'youtube-downloader-desktop' }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const releaseInfo = JSON.parse(data);
                resolve(releaseInfo.tag_name);
              } catch (e) {
                reject(e);
              }
            } else {
              reject(new Error(`Failed to fetch latest yt-dlp version: ${res.statusCode}`));
            }
          });
        }).on('error', (err) => {
          reject(err);
        });
      });
    } else {
      return Promise.resolve('manual_check_required');
    }
  }

  public async installDependency(dependency: DependencyType): Promise<{
    success: boolean;
    method: string;
    message: string
  }> {
    if (dependency !== 'yt-dlp') {
        return { success: false, method: 'none', message: 'Automatic installation is only supported for yt-dlp.' };
    }

    const depInfo = this.getDependencyInfo('yt-dlp');
    if (!depInfo || !depInfo.downloadUrl) {
        return { success: false, method: 'none', message: 'Could not find download information for yt-dlp.' };
    }

    const initialUrl = depInfo.downloadUrl;
    const destinationPath = this.getYtDlpPath();

    console.log('Installing yt-dlp...', initialUrl, '->', destinationPath);

    try {
        await fsp.mkdir(path.dirname(destinationPath), { recursive: true });

        const download = (url: string): Promise<void> => {
            return new Promise((resolve, reject) => {
                https.get(url, { headers: { 'User-Agent': 'youtube-downloader-desktop' } }, (response) => {
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        if (response.headers.location) {
                            download(response.headers.location).then(resolve).catch(reject);
                        } else {
                            reject(new Error('Redirect location not found.'));
                        }
                        return;
                    }

                    if (response.statusCode !== 200) {
                        reject(new Error(`Download failed with status code: ${response.statusCode}`));
                        return;
                    }

                    const file = fs.createWriteStream(destinationPath);
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(() => resolve());
                    });
                }).on('error', (err) => {
                    reject(err);
                });
            });
        };

        await download(initialUrl);

        if (process.platform !== 'win32') {
            await fsp.chmod(destinationPath, '755');
        }

        return { success: true, method: 'download', message: 'yt-dlp downloaded successfully.' };

    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        console.error(`Failed to install yt-dlp: ${message}`);
        // Clean up failed download
        try {
            await fsp.access(destinationPath);
            await fsp.unlink(destinationPath);
        } catch (cleanupError) {
            // Ignore error if file doesn't exist
        }
        return { success: false, method: 'download', message };
    }
  }
}