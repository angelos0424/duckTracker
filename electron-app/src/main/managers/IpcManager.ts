import { ipcMain, dialog, shell, clipboard, app, BrowserWindow } from 'electron';
import { SettingsManager } from '../SettingsManager';
import { DownloadManager } from '../services/DownloadManager';
import { ServerManager } from '../services/ServerManager';
import { NotificationManager } from '../NotificationManager';
import { DependencyChecker } from '../DependencyChecker';
import { AppSettings, DownloadRecord, ServerConfig } from '../../shared/types';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../ErrorHandler';
import { getUniqueIdFromParsedUrl, parseYouTubeUrl } from '../../shared/utils/urlParser';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import {WindowManager} from "./WindowManager";

// Helper to convert server record to shared record for notifications
const toSharedDownloadRecord = (record: DownloadRecord): DownloadRecord => {
    return {
      id: record.id,
      url: record.url,
      urlId: record.urlId,
      title: record.title || 'Untitled',
      status: record.status,
      progress: record.progress,
      filePath: record.filePath || '',
      fileSize: record.fileSize || 0,
      errorMessage: record.errorMessage ? record.errorMessage : '',
      startTime: record.startTime ? new Date(record.startTime) : new Date(),
      endTime: record.endTime ? new Date(record.endTime) : new Date(),
      createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
    };
  };

export class IpcManager {
    private settingsManager: SettingsManager;
    private downloadManager: DownloadManager;
    private serverManager: ServerManager;
    private notificationManager: NotificationManager;
    private dependencyChecker: DependencyChecker;
    private errorHandler: ErrorHandler;
    private windowManager: WindowManager;

    constructor(
        settingsManager: SettingsManager,
        downloadManager: DownloadManager,
        serverManager: ServerManager,
        notificationManager: NotificationManager,
        dependencyChecker: DependencyChecker,
        windowManager: WindowManager
    ) {
        this.settingsManager = settingsManager;
        this.downloadManager = downloadManager;
        this.serverManager = serverManager;
        this.notificationManager = notificationManager;
        this.dependencyChecker = dependencyChecker;
        this.errorHandler = ErrorHandler.getInstance();
        this.windowManager = windowManager;
    }

    public registerIpcHandlers(): void {
        ipcMain.on('minimize-window', () => {
            BrowserWindow.getFocusedWindow()?.minimize();
        });
    
        ipcMain.on('close-window', () => {
            BrowserWindow.getFocusedWindow()?.hide();
        });
    
        ipcMain.on('show-window', () => {
            BrowserWindow.getFocusedWindow()?.show();
        });

    // File system operations
    ipcMain.handle('open-file-location', async (_, filePath: string) => {
      console.log(`Attempting to open file location for: ${filePath}`);
      try {
        const normalizedPath = path.normalize(filePath);
        await shell.openPath(normalizedPath);
        console.log(`Successfully opened file location for: ${normalizedPath}`);
      } catch (error) {
        console.error(`Failed to open file location for ${filePath}:`, error);
        const appError = this.errorHandler.createError(
          'FILE_LOCATION_ERROR',
          ErrorCategory.FILE_SYSTEM,
          ErrorSeverity.LOW,
          `Failed to open file location: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not open the file location in your file manager.',
          [
            'Check if the file still exists at the specified location',
            'Try opening the download directory manually',
            'Ensure your file manager is working properly'
          ],
          { filePath, originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('open-folder-dialog', async () => {
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (!mainWindow) return null;
      try {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
          title: 'Select Download Directory'
        });
        return result;
      } catch (error) {
        const appError = this.errorHandler.createError(
          'FOLDER_DIALOG_ERROR',
          ErrorCategory.SYSTEM,
          ErrorSeverity.LOW,
          `Failed to open folder dialog: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not open the folder selection dialog.',
          [
            'Try again in a moment',
            'Restart the application if the problem persists',
            'Manually type the folder path in settings'
          ],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    // Download history operations
    ipcMain.handle('get-downloads', async (_, query?: { limit?: number; offset?: number; status?: string }) => {
      try {
        const statusFilter = query?.status === 'all' ? undefined : query?.status;
        const serverRecords = this.downloadManager.getHistory({ ...query, status: statusFilter });
        return serverRecords.map(record => toSharedDownloadRecord(record));
      } catch (error) {
        const appError = this.errorHandler.createError(
          'DATABASE_QUERY_ERROR',
          ErrorCategory.DATABASE,
          ErrorSeverity.MEDIUM,
          `Failed to get downloads: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not retrieve download history from the database.',
          [
            'Try refreshing the download history',
            'Restart the application if the problem persists',
            'Check if the database file is corrupted'
          ],
          { query, originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('delete-downloads', async (_, ids: string[]) => {
      try {
        const deletedCount = await this.downloadManager.deleteRecords(ids);
        return { deletedCount };
      } catch (error) {
        const appError = this.errorHandler.createError(
          'DATABASE_DELETE_ERROR',
          ErrorCategory.DATABASE,
          ErrorSeverity.MEDIUM,
          `Failed to delete downloads: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not delete the selected download records.',
          [
            'Try deleting the records again',
            'Restart the application if the problem persists',
            'Check if the database file is corrupted'
          ],
          { ids, originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('clear-download-history', async () => {
      try {
        const deletedCount = await this.downloadManager.clearHistory();
        return { deletedCount };
      } catch (error) {
        const appError = this.errorHandler.createError(
          'DATABASE_CLEAR_ERROR',
          ErrorCategory.DATABASE,
          ErrorSeverity.MEDIUM,
          `Failed to clear download history: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not clear the download history.',
          [
            'Try clearing the history again',
            'Restart the application if the problem persists',
            'Check if the database file is corrupted'
          ],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('get-download-statistics', async () => {
      try {
        return this.downloadManager.getStatistics();
      } catch (error) {
        const appError = this.errorHandler.createError(
          'DATABASE_STATS_ERROR',
          ErrorCategory.DATABASE,
          ErrorSeverity.LOW,
          `Failed to get download statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not retrieve download statistics.',
          [
            'Try refreshing the statistics',
            'Restart the application if the problem persists'
          ],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('retry-download', async (_, id: string) => {
      try {
        console.log('main retry download', id);
        const activeDownloads = this.serverManager.getActiveDownloads();
        const settings = await this.settingsManager.load();
        const maxConcurrentDownloads = settings.maxConcurrentDownloads;
        const status = activeDownloads.length >= maxConcurrentDownloads ? 'queued' : 'pending';
        const updatedRecord = await this.downloadManager.retryDownload(id, status);
        if (updatedRecord) {
          this.windowManager.sendToRenderer('download-updated', updatedRecord);
        }
      } catch (error) {
        console.error('Failed to retry download:', error);
        throw error;
      }
    });

    ipcMain.handle('stop-download', async (_, urlId: string) => {
      try {
        console.log('main stop download', urlId);
        await this.serverManager.stopDownload(urlId);
        const updatedRecord = this.downloadManager.getDownloadByUrlId(urlId);
        if (updatedRecord) {
          this.windowManager.sendToRenderer('download-updated', updatedRecord);
        }
      } catch (error) {
        console.error('Failed to stop download:', error);
        throw error;
      }
    });

    ipcMain.handle('get-clipboard-text', async () => {
      try {
        return clipboard.readText();
      } catch (error) {
        console.error('Failed to read clipboard text:', error);
        throw error;
      }
    });

    ipcMain.handle('start-download', async (_, url: string) => {
      try {
        const parsedUrl = parseYouTubeUrl(url);
        const urlId = getUniqueIdFromParsedUrl(parsedUrl);
        
        if (parsedUrl.type === 'unknown') {
          throw new Error('Unsupported URL type or invalid YouTube URL.');
        }

        await this.serverManager.startDownloadFromMain(url, urlId, '');
      } catch (error) {
        console.error('Failed to start download from main process:', error);
        throw error;
      }
    });

    ipcMain.handle('open-external-url', async (_, url: string) => {
      try {
        await shell.openExternal(url);
      } catch (error) {
        console.error(`Failed to open external URL ${url}:`, error);
        throw error;
      }
    });

    // Settings operations
    ipcMain.handle('get-settings', async () => {
      try {
        return await this.settingsManager.load(); // Always load directly
      } catch (error) {
        const appError = this.errorHandler.createError(
          'SETTINGS_LOAD_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.MEDIUM,
          `Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not load application settings.',
          [],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('save-settings', async (_, settings: AppSettings) => {
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (!mainWindow) return null;
      try {
        const validation = this.settingsManager.validate(settings);
        if (!validation.valid) {
          throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
        }

        const currentSettings = await this.settingsManager.load();
        
        const needsServerRestart =
          currentSettings.httpPort !== settings.httpPort ||
          currentSettings.wsPort !== settings.wsPort ||
          currentSettings.maxConcurrentDownloads !== settings.maxConcurrentDownloads ||
          currentSettings.downloadPath !== settings.downloadPath;

        await this.settingsManager.save(settings);

        this.notificationManager.updateSettings(settings);

        if (needsServerRestart) {
            const config: ServerConfig = {
                port: settings.httpPort,
                wsPort: settings.wsPort,
                corsOrigins: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
                maxConcurrentDownloads: settings.maxConcurrentDownloads,
                outputPath: settings.downloadPath,
                format: '', // This will be set in the restart method
                outputTemplate: settings.outputTemplate,
            };
          await this.serverManager.restart(config);
        }

        mainWindow.webContents.send('settings-updated', settings);

        return { success: true, serverRestarted: needsServerRestart };
      } catch (error) {
        const appError = this.errorHandler.createError(
          'SETTINGS_SAVE_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.MEDIUM,
          `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not save application settings.',
          [],
          { settings, originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('reset-settings', async () => {
        const mainWindow = BrowserWindow.getFocusedWindow();
        if (!mainWindow) return null;
      try {
        const defaultSettings = await this.settingsManager.reset();
        
        const config: ServerConfig = {
            port: defaultSettings.httpPort,
            wsPort: defaultSettings.wsPort,
            corsOrigins: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
            maxConcurrentDownloads: defaultSettings.maxConcurrentDownloads,
            outputPath: defaultSettings.downloadPath,
            format: '', // This will be set in the restart method
            outputTemplate: defaultSettings.outputTemplate,
        };
        await this.serverManager.restart(config);

        mainWindow.webContents.send('settings-updated', defaultSettings);

        return defaultSettings;
      } catch (error) {
        const appError = this.errorHandler.createError(
          'SETTINGS_RESET_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.MEDIUM,
          `Failed to reset settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not reset settings to default values.',
          [],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('validate-settings', async (_, settings: AppSettings) => {
      try {
        return this.settingsManager.validate(settings);
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('validate-path', async (_, path: string) => {
      try {
        const stats = await fs.stat(path);
        return {
          exists: true,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          readable: true,
          writable: true 
        };
      } catch (error) {
        return {
          exists: false,
          isDirectory: false,
          isFile: false,
          readable: false,
          writable: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    ipcMain.handle('create-directory', async (_, dirPath: string) => {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        return { success: true };
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('restart-server', async () => {
      try {
        const settings = await this.settingsManager.load();
        const config: ServerConfig = {
            port: settings.httpPort,
            wsPort: settings.wsPort,
            corsOrigins: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
            maxConcurrentDownloads: settings.maxConcurrentDownloads,
            outputPath: settings.downloadPath,
            format: '', // This will be set in the restart method
            outputTemplate: settings.outputTemplate,
        };
        await this.serverManager.restart(config);
        console.log('Server restarted via IPC');
      } catch (error) {
        throw error;
      }
    });

    // Notification management IPC handlers
    ipcMain.handle('get-notification-stats', async () => {
      return this.notificationManager.getNotificationStats();
    });

    ipcMain.handle('clear-notifications', async (_, tag?: string) => {
        if (tag) {
          this.notificationManager.clearNotificationsByTag(tag);
        } else {
          this.notificationManager.clearAllNotifications();
        }
        return { success: true };
    });

    ipcMain.handle('test-notification', async () => {
        await this.notificationManager.showInfo(
          'Test Notification',
          'This is a test notification to verify that notifications are working properly.'
        );
        return { success: true };
    });

    ipcMain.handle('get-server-status', async () => {
      return this.serverManager.getStatus();
    });

    // Dependency management IPC handlers
    ipcMain.handle('get-dependency-version', async (_, dependency: 'yt-dlp' | 'ffmpeg') => {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            let command: string;
      
            if (dependency === 'yt-dlp') {
              const isPackaged = app.isPackaged;
              const resourcesDir = isPackaged
                ? process.resourcesPath
                : path.join(__dirname, '../../resources');
      
              let ytDlpFileName: string;
              if (process.platform === 'win32') {
                ytDlpFileName = 'yt-dlp.exe';
              } else if (process.platform === 'darwin') {
                ytDlpFileName = 'yt-dlp';
              } else {
                ytDlpFileName = 'yt-dlp';
              }
      
              const ytDlpPath = path.join(resourcesDir, ytDlpFileName);
              command = `"${ytDlpPath}" --version`;
            } else { // ffmpeg
              command = `"${dependency}" -version`;
            }

            exec(command, (error: Error | null, stdout: string | undefined, stderr: string) => {
              if (error) {
                console.error(`Failed to get version for ${dependency}:`, error);
                resolve('Not found');
                return;
              }
              if (stderr) {
                  console.error(`stderr while getting version for ${dependency}:`, stderr);
              }
      
              const processedOutput = (stdout || '').trim();
      
              let result: string;
              if (dependency === 'ffmpeg') {
                const firstLine = processedOutput.split('\n')[0] || '';
                const parts = firstLine.split(' ');
      
                result = parts.length > 2 ? parts[2] || 'Not found' : 'Not found';
              } else {
                result = processedOutput || 'Not found';
              }
              console.log(`Dependency version for ${dependency}: ${result}`);
              resolve(result);
            });
          });
    });

    ipcMain.handle('check-for-updates', async (_, dependency: 'yt-dlp' | 'ffmpeg') => {
      return this.dependencyChecker.checkForUpdates(dependency);
    });

    ipcMain.handle('install-dependency', async (_, dependency: 'yt-dlp' | 'ffmpeg') => {
        const result = await this.dependencyChecker.installDependency(dependency);
        if (result.success && dependency === 'yt-dlp') {
          // this.reinitializeYtDlpDependentServices();
        }
        return result;
    });
    }
}
