import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import YTDlpWrap from 'yt-dlp-wrap';
import { ServerManager } from './services';
import { SettingsManager } from './SettingsManager';
import { DownloadManager } from './services/DownloadManager';
import { DatabaseManager } from './services/DatabaseManager';
import { AppSettings, DownloadRecord, ServerConfig } from '../shared/types';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './ErrorHandler';
import { NotificationManager } from './NotificationManager';
import { DependencyChecker } from './DependencyChecker';
import { WindowManager } from './managers/WindowManager';
import { TrayManager } from './managers/TrayManager';
import { IpcManager } from './managers/IpcManager';
import { initializeLogger } from './utils/logger';

initializeLogger();

class ElectronApp {
    private windowManager: WindowManager;
    private trayManager: TrayManager | null = null;
    private ipcManager: IpcManager;
    private serverManager: ServerManager;
    private settingsManager: SettingsManager;
    private databaseManager: DatabaseManager;
    private downloadManager: DownloadManager;
    private errorHandler: ErrorHandler;
    private notificationManager: NotificationManager;
    private dependencyChecker: DependencyChecker;
    private ytDlpWrap: YTDlpWrap;
    private isQuitting = false;
    private _appSettings: AppSettings | null = null;

    constructor() {
        const isPackaged = app.isPackaged;
        const resourcesDir = isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
        const ytDlpFileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
        const ytDlpPath = path.join(resourcesDir, ytDlpFileName);

        this.ytDlpWrap = new YTDlpWrap(ytDlpPath);
        this.databaseManager = new DatabaseManager();
        this.errorHandler = ErrorHandler.getInstance();
        this.notificationManager = NotificationManager.getInstance();
        this.dependencyChecker = new DependencyChecker();
        this.windowManager = new WindowManager();

        // Managers that depend on the database must be initialized after the DB
        this.downloadManager = new DownloadManager(this.databaseManager);
        this.settingsManager = new SettingsManager(this.databaseManager.getDatabase());
        this.serverManager = new ServerManager(this.ytDlpWrap, this.downloadManager, this.databaseManager, this.windowManager, resourcesDir);

        this.ipcManager = new IpcManager(
            this.settingsManager,
            this.downloadManager,
            this.serverManager,
            this.notificationManager,
            this.dependencyChecker,
            this.windowManager
        );

        this.initialize();
    }

    private initialize(): void {
        const gotTheLock = app.requestSingleInstanceLock();
        if (!gotTheLock) {
            app.quit();
            return;
        }

        app.on('second-instance', () => {
            this.windowManager.getMainWindow()?.show();
        });

        app.whenReady().then(async () => {
            await this.onAppReady();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                if (!this._appSettings?.minimizeToTray) {
                    app.quit();
                }
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });

        app.on('before-quit', () => {
            this.isQuitting = true;
        });
    }

    private async onAppReady(): Promise<void> {
        // Initialize database first
        try {
            await this.databaseManager.initialize();
        } catch (error) {
            this.errorHandler.handle(error as Error, { showDialog: true });
            app.quit();
            return;
        }

        // Load settings
        this._appSettings = await this.settingsManager.load();
        this.notificationManager.updateSettings(this._appSettings);

        // Create main window
        this.createWindow();

        // Register IPC handlers
        this.ipcManager.registerIpcHandlers();

        // Start the server
        await this.startServer();

        // Setup event handlers between managers
        this.setupEventHandlers();

        // Check for dependency updates on startup
        this.checkDependenciesOnStartup();
    }

    private async checkDependenciesOnStartup(): Promise<void> {
        try {
            const latestVersion = await this.dependencyChecker.checkForUpdates('yt-dlp');
            const currentVersion = (await this.ytDlpWrap.getVersion()).trim();

            if (latestVersion && latestVersion !== currentVersion) {
                this.notificationManager.showInfo(
                    'Update Available',
                    `A new version of yt-dlp (${latestVersion}) is available. Please update in Settings.`,
                    [],
                    true // Force notification
                );
            }
        } catch (error) {
            console.error('Failed to check for yt-dlp update on startup:', error);
            // Do not block app startup for this error
        }
    }

    private createWindow(): void {
        this.windowManager.createMainWindow((event: Electron.Event) => {
            if (this.isQuitting) {
                return;
            }
            if (this._appSettings?.minimizeToTray) {
                event.preventDefault();
                this.windowManager.getMainWindow()?.hide();
            } else {
                app.quit();
            }
        });

        // Now that the window is created, we can create the tray
        if (this.windowManager.getMainWindow()) {
            this.trayManager = new TrayManager(this.windowManager.getMainWindow()!, this.serverManager);
        }
    }

    private async startServer(): Promise<void> {
        if (!this._appSettings) {
            // This should not happen as settings are loaded before this
            this.errorHandler.handle(new Error('Settings not loaded'));
            return;
        }
        const config: ServerConfig = {
            port: this._appSettings.httpPort,
            corsOrigins: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
            maxConcurrentDownloads: this._appSettings.maxConcurrentDownloads,
            outputPath: this._appSettings.downloadPath,
            format: this.getFormatFromQuality(this._appSettings.videoQuality),
            outputTemplate: this._appSettings.outputTemplate,
        };
        try {
            await this.serverManager.start(config);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            let appError;

            if (errorMessage.includes('Ports are not available')) {
                appError = this.errorHandler.getErrorTemplate('PORT_CONFLICT', {
                    ports: errorMessage,
                    httpPort: config.port
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
            this.errorHandler.handle(appError, { showDialog: true });
        }
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

    private setupEventHandlers(): void {
        this.serverManager.on('server-started', () => {
            this.trayManager?.updateContextMenu();
        });

        this.serverManager.on('server-stopped', () => {
            this.trayManager?.updateContextMenu();
        });
    }
}

new ElectronApp();
