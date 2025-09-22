import { app, Menu, Tray, nativeImage, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { ServerManager } from '../services/ServerManager';

export class TrayManager {
    private tray: Tray | null = null;
    private mainWindow: BrowserWindow;
    private serverManager: ServerManager;

    constructor(mainWindow: BrowserWindow, serverManager: ServerManager) {
        this.mainWindow = mainWindow;
        this.serverManager = serverManager;
        this.createTray();
    }

    private getTrayIcon(): string {
        return path.join(__dirname, '../../assets/tray-icon.png');
    }

    private createTray(): void {
        const trayIconPath = this.getTrayIcon();
        let trayIcon: Electron.NativeImage;

        try {
            trayIcon = nativeImage.createFromPath(trayIconPath);
            if (trayIcon.isEmpty()) {
                trayIcon = nativeImage.createEmpty();
            }
        } catch (error) {
            console.warn('Failed to load tray icon, using empty icon:', error);
            trayIcon = nativeImage.createEmpty();
        }

        this.tray = new Tray(trayIcon);
        this.tray.setToolTip('YouTube Download Tracker');
        this.updateContextMenu();

        this.tray.on('click', () => this.toggleMainWindow());
        this.tray.on('double-click', () => this.showMainWindow());
    }

    public updateContextMenu(): void {
        if (!this.tray) return;

        const isWindowVisible = this.mainWindow.isVisible();

        const contextMenu = Menu.buildFromTemplate([
            {
                label: isWindowVisible ? 'Hide Window' : 'Show Window',
                click: () => this.toggleMainWindow(),
            },
            { type: 'separator' },
            {
                label: 'Downloads',
                click: () => this.showMainWindow(),
            },
            {
                label: 'Settings',
                click: () => this.showMainWindow(),
            },
            { type: 'separator' },
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
                                this.mainWindow.webContents.send('restart-server-from-tray');
                            } catch (error) {
                                console.error('Failed to restart server from tray:', error);
                            }
                        },
                    },
                ],
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => this.showQuitConfirmation(),
            },
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    private toggleMainWindow(): void {
        if (this.mainWindow.isVisible()) {
            this.mainWindow.hide();
        } else {
            this.showMainWindow();
        }
        this.updateContextMenu();
    }

    private showMainWindow(): void {
        this.mainWindow.show();
        this.mainWindow.focus();
    }

    private showQuitConfirmation(): void {
        dialog.showMessageBox(this.mainWindow, {
            type: 'question',
            buttons: ['Cancel', 'Quit'],
            defaultId: 1,
            cancelId: 0,
            title: 'Confirm Quit',
            message: 'Are you sure you want to quit YouTube Download Tracker?',
            detail: 'This will stop the download server and close the application.',
        }).then((result) => {
            if (result.response === 1) {
                app.quit();
            }
        });
    }

    public getTray(): Tray | null {
        return this.tray;
    }
}
