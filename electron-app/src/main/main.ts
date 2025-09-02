import {app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell, Tray} from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import YTDlpWrap from 'yt-dlp-wrap';
import {ServerManager} from '../server';
import {SettingsManager} from './SettingsManager';
import {DownloadManager} from '../server/DownloadManager';
import {DatabaseManager} from '../server/DatabaseManager';
import {
  AppSettings,
  DownloadEventData,
  DownloadRecord as ServerDownloadRecord,
  DownloadRecord,
  ServerConfig
} from '../shared/types';
import {ErrorCategory, ErrorHandler, ErrorSeverity} from './ErrorHandler';
import {NotificationManager} from './NotificationManager';
import {DependencyChecker} from './DependencyChecker';
import {getUniqueIdFromParsedUrl, parseYouTubeUrl} from '../shared/utils/urlParser';

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
    // Ensure dates are proper Date objects before sending over IPC.
    // IPC will serialize them, and the frontend will parse the string.
    startTime: record.startTime ? new Date(record.startTime) : new Date(), // Should always exist
    endTime: record.endTime ? new Date(record.endTime) : new Date(),
    createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
  };
};

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isMinimized: boolean;
}

class ElectronApp {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private serverManager!: ServerManager;
  private settingsManager!: SettingsManager;
  private databaseManager: DatabaseManager;
  private downloadManager!: DownloadManager;
  private errorHandler: ErrorHandler;
  private notificationManager: NotificationManager;
  private dependencyChecker: DependencyChecker;
  private ytDlpWrap!: YTDlpWrap;
  private isQuitting = false;
  private _appSettings: AppSettings | null = null;
  private windowState: WindowState = {
    width: 1200,
    height: 800,
    isMaximized: false,
    isMinimized: false
  };

  constructor() {
    // Initialize yt-dlp with the correct path
    // Use the same resources resolution logic as DependencyChecker to avoid dev/prod mismatches
    const isPackaged = app.isPackaged;
    const resourcesDir = isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), 'resources');

    // Determine executable name by platform
    let ytDlpFileName: string;
    if (process.platform === 'win32') {
      ytDlpFileName = 'yt-dlp.exe';
    } else if (process.platform === 'darwin') {
      ytDlpFileName = 'yt-dlp';
    } else {
      ytDlpFileName = 'yt-dlp';
    }

    const ytDlpPath = path.join(resourcesDir, ytDlpFileName);

    console.log(`Setting YTDlpWrap path to: ${ytDlpPath}`);

    this.ytDlpWrap = new YTDlpWrap(ytDlpPath);
    // ytDlpWrap.setOption('ffmpeg-location', ffmpegPath);
    this.databaseManager = new DatabaseManager();
    this.errorHandler = ErrorHandler.getInstance();
    this.notificationManager = NotificationManager.getInstance();
    this.dependencyChecker = new DependencyChecker();
    this.initialize();
  }

  private reinitializeYtDlpDependentServices(): void {
    const isPackaged = app.isPackaged;
    const resourcesDir = isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), 'resources');

    let ytDlpFileName: string;
    if (process.platform === 'win32') {
      ytDlpFileName = 'yt-dlp.exe';
    } else if (process.platform === 'darwin') {
      ytDlpFileName = 'yt-dlp-macos';
    } else {
      ytDlpFileName = 'yt-dlp';
    }

    const ytDlpPath = path.join(resourcesDir, ytDlpFileName);

    console.log(`Re-initializing YTDlpWrap with path: ${ytDlpPath}`);

    const ytDlpWrap = new YTDlpWrap(ytDlpPath);
    this.serverManager.setYtDlpWrap(ytDlpWrap);
  }

  private setupDownloadManagerEventHandlers(): void {
    // Forward download manager events to renderer process
    this.downloadManager.on('download-updated', (record: ServerDownloadRecord) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const sharedRecord = toSharedDownloadRecord(record);
        console.log(`Sending download-updated to renderer: ID=${sharedRecord.id}, Status=${sharedRecord.status}, Progress=${sharedRecord.progress}`);
        this.mainWindow.webContents.send('download-updated', sharedRecord);
      }
      // Show notifications for completed and failed downloads
      if (record.status === 'completed') {
        this.notificationManager.showDownloadCompleted(toSharedDownloadRecord(record));
      } else if (record.status === 'failed') {
        this.notificationManager.showDownloadFailed(toSharedDownloadRecord(record), async () => {
          console.log('Retry download requested for:', record.url);
          this.showFromTray();
        });
      }
    });

    this.downloadManager.on('records-deleted', (ids: string[]) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('records-deleted', ids);
      }
    });

    this.downloadManager.on('history-cleared', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('history-cleared');
      }
    });

    this.downloadManager.on('download-retried', (record: ServerDownloadRecord) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('download-updated', toSharedDownloadRecord(record));
      }
    });

    this.downloadManager.on('download-restarted-request', async (data: { url: string; urlId: string; title: string }) => {
      console.log('Download restarted request received:', data);
      try {
        await this.serverManager.startDownloadFromMain(data.url, data.urlId, data.title);
      } catch (error) {
        console.error('Failed to restart download from main:', error);
      }
    });

    this.downloadManager.on('refresh-history', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('refresh-history');
      }
    });
  }

  private setupServerEventHandlers(): void {
    // Server lifecycle events
    this.serverManager.on('server-started', (data: { httpPort: number; wsPort: number }) => {
      console.log(`Server started on HTTP:${data.httpPort}, WS:${data.wsPort}`);
      this.updateTrayMenu();
    });

    this.serverManager.on('server-stopped', () => {
      console.log('Server stopped');
      this.updateTrayMenu();
    });

    this.serverManager.on('server-restarted', () => {
      console.log('Server restarted');
      this.updateTrayMenu();
    });

    this.serverManager.on('error', async (error: Error) => {
      const appError = this.errorHandler.createError(
        'SERVER_ERROR',
        ErrorCategory.SYSTEM,
        ErrorSeverity.HIGH,
        `Server error: ${error.message}`,
        'The download server encountered an error and may not be functioning properly.',
        [
          'Restart the server from the system tray menu',
          'Check if other applications are using the same ports',
          'Restart the application if the problem persists'
        ],
        { originalError: error.message, stack: error.stack }
      );
      await this.errorHandler.handle(appError);
    });

    // WebSocket connection events
    this.serverManager.on('client-connected', () => {
      console.log('Chrome extension connected');
    });

    this.serverManager.on('client-disconnected', () => {
      console.log('Chrome extension disconnected');
    });

    this.serverManager.on('websocket-error', async (error: Error) => {
      const appError = this.errorHandler.createError(
        'WEBSOCKET_ERROR',
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM,
        `WebSocket error: ${error.message}`,
        'The connection to the Chrome extension was interrupted.',
        [
          'Check if the Chrome extension is still installed and enabled',
          'Refresh the YouTube page in your browser',
          'Restart the browser if the problem persists'
        ],
        { originalError: error.message, stack: error.stack }
      );
      await this.errorHandler.handle(appError, { showDialog: false });
    });

    // Download events - integrate with DownloadManager
    this.serverManager.on('download-started', async (data: DownloadEventData) => {
      console.log('ServerManager: Download started event received:', data);
      try {
        await this.downloadManager.handleDownloadStart(data.url, data.urlId, data.title);
      } catch (error) {
        console.error('Failed to handle download start:', error);
      }
    });

    this.serverManager.on('download-progress', async (data: DownloadEventData) => {
      try {
        await this.downloadManager.updateProgress(data.urlId, data.progress || 0, data.title);
      } catch (error) {
        console.error('Failed to update download progress:', error);
      }
    });

    this.serverManager.on('download-completed', async (data: DownloadEventData) => {
      console.log('ServerManager: Download completed event received:', data);
      try {
        await this.downloadManager.completeDownload(data.urlId, data.filePath, data.title, data.fileSize);
      } catch (error) {
        console.error('Failed to complete download in database:', error);
      }
    });

    this.serverManager.on('download-failed', async (data: DownloadEventData) => {
      console.log('ServerManager: Download failed event received:', data);
      try {
        await this.downloadManager.failDownload(data.urlId, data.error || 'Unknown error', data.title);
      } catch (error) {
        console.error('Failed to mark download as failed:', error);
      }
    });

    this.serverManager.on('download-stopped', async (data: DownloadEventData) => {
      console.log('ServerManager: Download stopped event received:', data);
      try {
        await this.downloadManager.cancelDownload(data.urlId);
      } catch (error) {
        console.error('Failed to cancel download in database:', error);
      }
    });

    this.serverManager.on('download-queued', async (data: DownloadEventData) => {
      try {
        // This will create a new record with 'queued' status
        await this.downloadManager.createDownloadRecord(data.url, data.urlId, data.title, 'queued');
      } catch (error) {
        console.error('Failed to handle download queued:', error);
      }
    });

    this.serverManager.on('request-next-download', async () => {
      console.log('ServerManager requested next download from the queue.');
      try {
        const nextDownload = this.downloadManager.popNextQueuedDownload();
        if (nextDownload) {
          console.log(`Popped download ${nextDownload.id} from queue, starting it.`);
          await this.serverManager.startDownloadFromMain(nextDownload.url, nextDownload.urlId, nextDownload.title || '');
        } else {
          console.log('No more downloads in the queue.');
        }
      } catch (error) {
        console.error('Failed to process next download in queue:', error);
      }
    });
  }

  private async startServer(): Promise<void> {
    let config: any = null;
    try {
      // Use cached settings if available, otherwise load
      const settings = this._appSettings || await this.settingsManager.load();
      if (!this._appSettings) { // If settings were loaded, cache them
        this._appSettings = settings;
      }
      config = this.createServerConfig(settings);

      await this.serverManager.start(config);
      console.log('Server started successfully');
    } catch (error) {
      // Determine error type and create appropriate error
      let appError;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Ports are not available') && config) {
        appError = this.errorHandler.getErrorTemplate('PORT_CONFLICT', {
          ports: errorMessage,
          httpPort: config.port,
          wsPort: config.wsPort
        });
      } else {
        appError = this.errorHandler.createError(
          'SERVER_STARTUP_FAILED',
          ErrorCategory.SYSTEM,
          ErrorSeverity.CRITICAL,
          `Failed to start server: ${errorMessage}`,
          'The download server could not be started. The application may not function properly.',
          [
            'Check if other applications are using the same ports',
            'Try changing the port numbers in Settings',
            'Restart your computer and try again',
            'Contact support if the problem persists'
          ],
          { originalError: errorMessage, config: config || {} }
        );
      }

      await this.errorHandler.handle(appError);
    }
  }

  private async restartServerWithSettings(settings: AppSettings): Promise<void> {
    try {
      const config = this.createServerConfig(settings);
      await this.serverManager.restart(config);
      this._appSettings = settings; // Update cached settings after successful restart
      console.log('Server restarted with new settings');
    } catch (error) {
      console.error('Failed to restart server with settings:', error);
      throw error;
    }
  }

  private createServerConfig(settings: AppSettings): ServerConfig {
    return {
      port: settings.httpPort,
      wsPort: settings.wsPort,
      corsOrigins: [
        'chrome-extension://*',
        'moz-extension://*',
        'http://localhost:*'
      ],
      maxConcurrentDownloads: settings.maxConcurrentDownloads,
      outputPath: settings.downloadPath,
      format: this.getFormatFromQuality(settings.videoQuality),
      outputTemplate: settings.outputTemplate
    };
  }

  private getFormatFromQuality(quality: string): string {
    switch (quality) {
      case '1080p':
        return 'bv*[height<=1080][ext=webm]+ba*[ext=webm]/bv*[height<=1080][ext=mp4]+ba*[ext=m4a]/best[height<=1080]';
      case '720p':
        return 'bv*[height<=720][ext=webm]+ba*[ext=webm]/bv*[height<=720][ext=mp4]+ba*[ext=m4a]/best[height<=720]';
      case '480p':
        return 'bv*[height<=480][ext=webm]+ba*[ext=webm]/bv*[height<=480][ext=mp4]+ba*[ext=m4a]/best[height<=480]';
      case 'best':
      default:
        return 'bv*[height>=1080][ext=webm]+ba*[ext=webm]/bv*[height>=720][ext=webm]+ba*[ext=webm]/bv*[ext=mp4]+ba*[ext=m4a]/bv*[ext=mp4]+ba*[ext=aac]/best';
    }
  }

  private initialize(): void {
    console.log('Initializing ElectronApp...');
    // Prevent multiple instances
    const gotTheLock = app.requestSingleInstanceLock();
    
    console.log('requestSingleInstanceLock result:', gotTheLock);
    if (!gotTheLock) {
      console.log('Another instance is running, quitting...');
      app.quit();
      return;
    }

    app.on('second-instance', () => {
      // Someone tried to run a second instance, focus our window instead
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });

    app.whenReady().then(async () => {
      console.log('App is ready. Starting initialization...');
      const userDataPath = app.getPath('userData');
      console.log(`User Data Path: ${userDataPath}`);
      console.log(`app.getAppPath(): ${app.getAppPath()}`);
      console.log(`process.resourcesPath: ${process.resourcesPath}`);
      // Setup file logging after app is ready
      const logFile = require('fs').createWriteStream(require('path').join(app.getPath('userData'), 'debug.log'), { flags: 'a' });
      const logStdout = process.stdout;
      const logStderr = process.stderr;
      console.log = function (...args) {
        logFile.write(require('util').format.apply(null, args) + '\n');
        logStdout.write(require('util').format.apply(null, args) + '\n');
      };
      console.error = function (...args) {
        logFile.write(require('util').format.apply(null, args) + '\n');
        logStderr.write(require('util').format.apply(null, args) + '\n');
      };
      console.log('File logging initialized.');
      // Check dependencies first
      try {
        console.log('Checking application dependencies...');
        const dependencyResult = await this.dependencyChecker.checkAllDependencies();
        
        if (!dependencyResult.success) {
          console.warn('Dependency check failed:', dependencyResult);
          await this.dependencyChecker.handleDependencyFailures(dependencyResult);
          
          // Try to auto-download yt-dlp if it's missing
          if (dependencyResult.missingDependencies.includes('yt-dlp')) {
            console.log('Attempting to download yt-dlp automatically...');
            const downloadSuccess = await this.dependencyChecker.downloadYtDlp();
            if (downloadSuccess) {
              console.log('yt-dlp downloaded successfully');
              this.reinitializeYtDlpDependentServices();
              await this.notificationManager.showInfo(
                'Dependency Downloaded',
                'yt-dlp has been downloaded and is ready to use.'
              );
            }
          }
        } else {
          console.log('All dependencies are available');
        }
      } catch (error) {
        console.error('Dependency check error:', error);
        // Continue with startup even if dependency check fails
      }

      // Initialize yt-dlp with the correct path
      // The ytDlpWrap is already initialized in the constructor
      // and passed to ServerManager. No need to re-initialize here.

      // Initialize database
      try {
        await this.databaseManager.initialize();
        console.log('Database initialized successfully');
      } catch (error) {
        console.error('Caught critical database initialization error in main.ts:', error);
        const appError = this.errorHandler.getErrorTemplate('DATABASE_CORRUPTION', {
          originalError: error instanceof Error ? error.message : 'Unknown error',
          dbPath: 'Check logs for specific path',
          stack: error instanceof Error ? error.stack : 'No stack available'
        });
        await this.errorHandler.handle(appError);
        app.quit();
        return;
      }

      // Now that database is initialized, instantiate managers that depend on it
      this.downloadManager = new DownloadManager(this.databaseManager);
      this.serverManager = new ServerManager(this.ytDlpWrap, this.downloadManager, this.databaseManager);
      this.setupServerEventHandlers(); // Call this after serverManager is initialized
      this.setupDownloadManagerEventHandlers();
      this.settingsManager = new SettingsManager(this.databaseManager.getDatabase()); // Moved this line

      try {
        this._appSettings = await this.settingsManager.load(); // Store the loaded settings
        this.notificationManager.updateSettings(this._appSettings);
        this.notificationManager.updateSettings(this._appSettings);

      } catch (error) {
        console.error('Failed to initialize settings:', error);
        const appError = this.errorHandler.createError(
          'SETTINGS_LOAD_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.CRITICAL,
          `Failed to initialize settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'The application could not load or create a valid settings file. Please restart the application.',
          [
            'Ensure you have write permissions to the application data directory',
            'Try restarting your computer',
            'Contact support if the problem persists'
          ],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError);
        this._appSettings = this.settingsManager.getDefaults();
        // app.quit(); // Critical error, cannot proceed without valid settings
        // return;
      }

      this.createMainWindow();
      this.setupSystemTray();
      this.setupIpcHandlers();
      await this.startServer();
      await this.resumeUnfinishedDownloads();
    });

    app.on('window-all-closed', () => {
      // On macOS, the app usually stays active.
      if (process.platform === 'darwin') {
        return;
      }

      // On other platforms, quit unless minimizeToTray is enabled.
      if (!this._appSettings?.minimizeToTray) {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (this.mainWindow) {
        this.showFromTray();
      } else if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', () => {
      this.isQuitting = true;
    });
  }

  private createMainWindow(): void {
    // Restore window state
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: this.windowState.width,
      height: this.windowState.height,
      ...(this.windowState.x !== undefined && { x: this.windowState.x }),
      ...(this.windowState.y !== undefined && { y: this.windowState.y }),
      minWidth: 800,
      minHeight: 600,
      show: false, // Don't show until ready
      icon: this.getAppIcon(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false
      },
      titleBarStyle: 'default',
      autoHideMenuBar: true
    };

    this.mainWindow = new BrowserWindow(windowOptions);

    // Open main process dev tools for debugging
    this.mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Restore maximized state
    if (this.windowState.isMaximized) {
      this.mainWindow.maximize();
    }

    // Setup window event handlers
    this.setupWindowEventHandlers();

    // Load the renderer process
    this.loadRenderer();

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow && !this.windowState.isMinimized) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });
  }

  private setupWindowEventHandlers(): void {
    if (!this.mainWindow) return;

    // Handle window close - minimize to tray instead of closing
    this.mainWindow.on('close', (event) => {
      if (this.isQuitting) {
        this.saveWindowState();
        return;
      }

      if (this._appSettings?.minimizeToTray) {
        event.preventDefault();
        this.hideToTray();
      } else {
        this.quit();
      }
    });

    // Save window state on resize/move
    this.mainWindow.on('resize', () => this.saveWindowState());
    this.mainWindow.on('move', () => this.saveWindowState());
    this.mainWindow.on('maximize', () => this.saveWindowState());
    this.mainWindow.on('unmaximize', () => this.saveWindowState());

    // Handle minimize
    this.mainWindow.on('minimize', () => {
      this.hideToTray();
    });

    // Handle restore
    this.mainWindow.on('restore', () => {
      this.windowState.isMinimized = false;
    });
  }

  private saveWindowState(): void {
    if (!this.mainWindow) return;

    const bounds = this.mainWindow.getBounds();
    this.windowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: this.mainWindow.isMaximized(),
      isMinimized: this.mainWindow.isMinimized()
    };
  }

  private hideToTray(): void {
    if (this.mainWindow) {
      this.mainWindow.hide();
      this.windowState.isMinimized = true;
    }
  }

  private showFromTray(): void {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.windowState.isMinimized = false;
      // Update tray menu to reflect new state
      this.updateTrayMenu();
    }
  }

  private loadRenderer(): void {
    if (!this.mainWindow) return;

    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
    }
  }

  private getAppIcon(): string {
    // Return path to app icon - will be created in later tasks
    return path.join(__dirname, '../../assets/icon.png');
  }

  private getTrayIcon(): string {
    // Return path to tray icon
    return path.join(__dirname, '../../assets/tray-icon.png');
  }

  private setupSystemTray(): void {
    // Create tray icon
    const trayIconPath = this.getTrayIcon();
    let trayIcon: Electron.NativeImage;
    
    try {
      trayIcon = nativeImage.createFromPath(trayIconPath);
      if (trayIcon.isEmpty()) {
        // Fallback to a simple icon if file doesn't exist
        trayIcon = nativeImage.createEmpty();
      }
    } catch (error) {
      console.warn('Failed to load tray icon, using empty icon:', error);
      trayIcon = nativeImage.createEmpty();
    }

    this.tray = new Tray(trayIcon);
    
    // Set tray tooltip
    this.tray.setToolTip('YouTube Download Tracker');
    
    // Create context menu
    this.updateTrayMenu();
    
    // Handle tray click events
    this.tray.on('click', () => {
      this.toggleMainWindow();
    });

    this.tray.on('double-click', () => {
      this.showFromTray();
    });
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;

    const isWindowVisible = this.mainWindow && this.mainWindow.isVisible();
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isWindowVisible ? 'Hide Window' : 'Show Window',
        click: () => {
          this.toggleMainWindow();
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Downloads',
        click: () => {
          this.showFromTray();
          // TODO: Navigate to downloads tab when renderer is implemented
        }
      },
      {
        label: 'Settings',
        click: () => {
          this.showFromTray();
          // TODO: Navigate to settings tab when renderer is implemented
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Server Status',
        submenu: [
          {
            label: this.serverManager.getStatus().running ? 'Running' : 'Stopped',
            enabled: false,
          },
          {
            label: 'Restart Server',
            click: async () => {
              try {
                const settings = await this.settingsManager.load();
                await this.restartServerWithSettings(settings);
                console.log('Server restarted from tray');
              } catch (error) {
                console.error('Failed to restart server:', error);
              }
            }
          }
        ]
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        click: () => {
          this.showQuitConfirmation();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private toggleMainWindow(): void {
    if (!this.mainWindow) {
      this.createMainWindow();
      return;
    }

    if (this.mainWindow.isVisible()) {
      this.hideToTray();
    } else {
      this.showFromTray();
    }
    
    // Update tray menu to reflect new state
    this.updateTrayMenu();
  }

  private showQuitConfirmation(): void {
    if (!this.mainWindow) {
      this.quit();
      return;
    }
    
    dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'Quit'],
      defaultId: 1,
      cancelId: 0,
      title: 'Confirm Quit',
      message: 'Are you sure you want to quit YouTube Download Tracker?',
      detail: 'This will stop the download server and close the application.'
    }).then((result) => {
      if (result.response === 1) {
        this.quit();
      }
    });
  }

  private setupIpcHandlers(): void {
    console.log('Setting up IPC handlers...');
    // Window management IPC handlers
    ipcMain.on('minimize-window', () => {
      if (this.mainWindow) {
        this.mainWindow.minimize();
      }
    });

    ipcMain.on('close-window', () => {
      if (this.mainWindow) {
        this.hideToTray();
      }
    });

    ipcMain.on('show-window', () => {
      this.showFromTray();
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
      try {
        const result = await dialog.showOpenDialog(this.mainWindow!, {
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
        // Ensure status is passed correctly, or undefined if 'all'
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
        const settings = this._appSettings || await this.settingsManager.load();
        const maxConcurrentDownloads = settings.maxConcurrentDownloads;
        const status = activeDownloads.length >= maxConcurrentDownloads ? 'queued' : 'pending';
        await this.downloadManager.retryDownload(id, status);
      } catch (error) {
        console.error('Failed to retry download:', error);
        throw error;
      }
    });

    ipcMain.handle('stop-download', async (_, urlId: string) => {
      try {
        console.log('main stop download', urlId);
        this.serverManager.stopDownload(urlId);
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
        // Return cached settings if available, otherwise load and cache
        if (this._appSettings) {
          return this._appSettings;
        }
        const settings = await this.settingsManager.load();
        this._appSettings = settings;
        return settings;
      } catch (error) {
        const appError = this.errorHandler.createError(
          'SETTINGS_LOAD_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.MEDIUM,
          `Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not load application settings.',
          [
            'Try restarting the application',
            'Reset settings to default values if the problem persists',
            'Check if the settings file is corrupted'
          ],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('save-settings', async (_, settings: AppSettings) => {
      try {
        // Validate settings first
        const validation = this.settingsManager.validate(settings);
        if (!validation.valid) {
          const appError = this.errorHandler.getErrorTemplate('CONFIG_INVALID', {
            validationErrors: validation.errors,
            settings
          });
          await this.errorHandler.handle(appError, { showDialog: false });
          throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
        }

        // Use cached settings for comparison if available, otherwise load
        const currentSettings = this._appSettings || await this.settingsManager.load();
        
        const needsServerRestart =
          currentSettings.httpPort !== settings.httpPort ||
          currentSettings.wsPort !== settings.wsPort ||
          currentSettings.maxConcurrentDownloads !== settings.maxConcurrentDownloads ||
          currentSettings.downloadPath !== settings.downloadPath;

        // Save settings
        await this.settingsManager.save(settings);
        this._appSettings = settings; // Update cached settings

        // Update notification manager with new settings
        this.notificationManager.updateSettings(settings);

        // Restart server if needed
        if (needsServerRestart) {
          await this.restartServerWithSettings(settings);
        }

        // Notify renderer of settings update
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('settings-updated', settings);
        }

        return { success: true, serverRestarted: needsServerRestart };
      } catch (error) {
        const appError = this.errorHandler.createError(
          'SETTINGS_SAVE_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.MEDIUM,
          `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not save application settings.',
          [
            'Check if you have write permissions to the application data directory',
            'Try saving the settings again',
            'Restart the application if the problem persists'
          ],
          { settings, originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('reset-settings', async () => {
      try {
        const defaultSettings = await this.settingsManager.reset();
        this._appSettings = defaultSettings; // Update cached settings
        
        // Restart server with default settings
        await this.restartServerWithSettings(defaultSettings);

        // Notify renderer of settings update
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('settings-updated', defaultSettings);
        }

        return defaultSettings;
      } catch (error) {
        const appError = this.errorHandler.createError(
          'SETTINGS_RESET_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.MEDIUM,
          `Failed to reset settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not reset settings to default values.',
          [
            'Try restarting the application',
            'Check if you have write permissions to the application data directory',
            'Manually delete the settings file if the problem persists'
          ],
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
        const appError = this.errorHandler.createError(
          'SETTINGS_VALIDATION_ERROR',
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.LOW,
          `Failed to validate settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not validate the provided settings.',
          [
            'Check if all required settings are provided',
            'Ensure settings values are within valid ranges',
            'Try using default settings'
          ],
          { settings, originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    // Path validation operations
    ipcMain.handle('validate-path', async (_, path: string) => {
      try {
        const stats = await fs.stat(path);
        return {
          exists: true,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          readable: true,
          writable: true // We'll assume writable for now
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
        const appError = this.errorHandler.getErrorTemplate('DIRECTORY_ACCESS', {
          dirPath,
          originalError: error instanceof Error ? error.message : 'Unknown error'
        });
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    ipcMain.handle('restart-server', async () => {
      try {
        // Use cached settings for server restart
        if (!this._appSettings) {
          throw new Error('Application settings not loaded. Cannot restart server.');
        }
        await this.restartServerWithSettings(this._appSettings);
        console.log('Server restarted via IPC');
      } catch (error) {
        const appError = this.errorHandler.createError(
          'SERVER_RESTART_ERROR',
          ErrorCategory.SYSTEM,
          ErrorSeverity.MEDIUM,
          `Failed to restart server: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Could not restart the download server.',
          [
            'Try restarting the server again',
            'Check if the server configuration is valid',
            'Restart the application if the problem persists'
          ],
          { originalError: error instanceof Error ? error.message : 'Unknown error' }
        );
        await this.errorHandler.handle(appError, { showDialog: false });
        throw error;
      }
    });

    // Notification management IPC handlers
    ipcMain.handle('get-notification-stats', async () => {
      try {
        return this.notificationManager.getNotificationStats();
      } catch (error) {
        console.error('Failed to get notification stats:', error);
        return {
          active: 0,
          byType: {},
          supported: false,
          enabled: false
        };
      }
    });

    ipcMain.handle('clear-notifications', async (_, tag?: string) => {
      try {
        if (tag) {
          this.notificationManager.clearNotificationsByTag(tag);
        } else {
          this.notificationManager.clearAllNotifications();
        }
        return { success: true };
      } catch (error) {
        console.error('Failed to clear notifications:', error);
        throw error;
      }
    });

    ipcMain.handle('test-notification', async () => {
      try {
        await this.notificationManager.showInfo(
          'Test Notification',
          'This is a test notification to verify that notifications are working properly.'
        );
        return { success: true };
      } catch (error) {
        console.error('Failed to show test notification:', error);
        throw error;
      }
    });

    ipcMain.handle('get-server-status', async () => {
      return this.serverManager.getStatus();
    });

    // Dependency management IPC handlers
    ipcMain.handle('get-dependency-version', async (_, dependency: 'yt-dlp' | 'ffmpeg') => {
      return this.getDependencyVersion(dependency);
    });

    ipcMain.handle('check-for-updates', async (_, dependency: 'yt-dlp' | 'ffmpeg') => {
      if (dependency === 'yt-dlp') {
        try {
          const https = require('https');
          return new Promise((resolve, reject) => {
            const options = {
              hostname: 'api.github.com',
              path: '/repos/yt-dlp/yt-dlp/releases/latest',
              method: 'GET',
              headers: { 'User-Agent': 'YouTube-Download-Tracker-App' }
            };

            https.get(options, (res: any) => {
              let data = '';
              res.on('data', (chunk: any) => {
                data += chunk;
              });
              res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                  const releaseInfo = JSON.parse(data);
                  resolve(releaseInfo.tag_name);
                } else {
                  reject(new Error(`Failed to fetch latest yt-dlp version: ${res.statusCode}`));
                }
              });
            }).on('error', (err: Error) => {
              reject(err);
            });
          });
        } catch (error) {
          console.error('Failed to check for yt-dlp update:', error);
          throw error;
        }
      } else { // ffmpeg
        return 'manual_check_required';
      }
    });

    ipcMain.handle('install-dependency', async (_, dependency: 'yt-dlp' | 'ffmpeg') => {
      try {
        const result = await this.dependencyChecker.installDependency(dependency);
        if (result.success && dependency === 'yt-dlp') {
          this.reinitializeYtDlpDependentServices();
        }
        return result;
      } catch (error) {
        console.error(`Failed to install ${dependency}:`, error);
        throw error;
      }
    });
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public getTray(): Tray | null {
    return this.tray;
  }

  public async quit(): Promise<void> {
    this.isQuitting = true;
    
    try {
      // Stop the server gracefully before quitting
      await this.serverManager.stop();
    } catch (error) {
      console.error('Error stopping server during quit:', error);
    }

    try {
      // Close the database connection
      this.databaseManager.close();
    } catch (error) {
      console.error('Error closing database during quit:', error);
    }
    
    app.quit();
  }

  private async resumeUnfinishedDownloads(): Promise<void> {
    console.log('Checking for unfinished downloads to resume or queue...');
    try {
      const unfinishedDownloads = this.downloadManager.getDownloadsByStatus(['downloading', 'pending', 'queued']);

      if (unfinishedDownloads.length > 0) {
        console.log(`Found ${unfinishedDownloads.length} unfinished downloads.`);

        // We don't need to await each one, we can trigger them in parallel
        const resumePromises = unfinishedDownloads.map(download => {
          console.log(`Attempting to resume/re-queue download: ${download.title} (${download.id}) with status ${download.status}`);
          return this.downloadManager.retryDownload(download.id).catch(error => {
            console.error(`Failed to resume download ${download.id}:`, error);
            // Optionally, mark it as failed here
          });
        });

        await Promise.all(resumePromises);
        console.log('Finished processing unfinished downloads.');
      } else {
        console.log('No unfinished downloads found.');
      }
    } catch (error) {
      console.error('Failed to fetch or resume unfinished downloads:', error);
      // Handle this error appropriately, maybe show a notification
    }
  }

  private getDependencyVersion(dependency: 'yt-dlp' | 'ffmpeg'): Promise<string> {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      let command: string;

      if (dependency === 'yt-dlp') {
        const isPackaged = app.isPackaged;
        const resourcesDir = isPackaged
          ? path.join(process.resourcesPath, 'resources')
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

        // Ensure stdout is a string before processing
        // If stdout is undefined, treat it as an empty string for processing
        const processedOutput = (stdout || '').trim();

        let result: string;
        if (dependency === 'ffmpeg') {
          const firstLine = processedOutput.split('\n')[0] || ''; // Ensure firstLine is a string
          const parts = firstLine.split(' '); // split always returns string[]

          result = parts.length > 2 ? parts[2] || 'Not found' : 'Not found'; // Ensure parts[2] is string
        } else {
          result = processedOutput || 'Not found';
        }
        console.log(`Dependency version for ${dependency}: ${result}`);
        resolve(result);
      });
    });
  }
}

// Initialize the application
const electronApp = new ElectronApp();

// Export for potential use in other modules
export default electronApp;