import { app, BrowserWindow } from 'electron';
import * as path from 'path';

export interface WindowState {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized: boolean;
}

export class WindowManager {
    public mainWindow: BrowserWindow | null = null;
    private windowState: WindowState;

    constructor() {
        this.windowState = {
            width: 1200,
            height: 800,
            isMaximized: false,
        };
    }

    public createMainWindow(onClose: (event: Electron.Event) => void): void {
        const windowOptions: Electron.BrowserWindowConstructorOptions = {
            width: this.windowState.width,
            height: this.windowState.height,
            ...(this.windowState.x !== undefined && { x: this.windowState.x }),
            ...(this.windowState.y !== undefined && { y: this.windowState.y }),
            minWidth: 800,
            minHeight: 600,
            show: false,
            icon: this.getAppIcon(),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../../preload/preload.js'),
                webSecurity: true,
                allowRunningInsecureContent: false,
            },
            titleBarStyle: 'default',
            autoHideMenuBar: true,
        };

        this.mainWindow = new BrowserWindow(windowOptions);

        if (this.windowState.isMaximized) {
            this.mainWindow.maximize();
        }

        this.setupWindowEventHandlers(onClose);
        this.loadRenderer();

        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
            this.mainWindow?.focus();
        });
    }

    private setupWindowEventHandlers(onClose: (event: Electron.Event) => void): void {
        if (!this.mainWindow) return;

        this.mainWindow.on('close', onClose);
        this.mainWindow.on('resize', () => this.saveWindowState());
        this.mainWindow.on('move', () => this.saveWindowState());
        this.mainWindow.on('maximize', () => this.saveWindowState());
        this.mainWindow.on('unmaximize', () => this.saveWindowState());
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
        };
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
        return path.join(__dirname, '../../assets/icon.png');
    }

    public getMainWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    public sendToRenderer(channel: string, ...args: any[]): void {
        this.mainWindow?.webContents.send(channel, ...args);
    }
}
