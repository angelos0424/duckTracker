import { contextBridge, ipcRenderer } from 'electron';
import {AppSettings, DownloadRecord, ServerStatus} from "../shared/types";
import {DependencyType} from "../main/DependencyChecker";
// Removed direct import of types, now relying on global declaration
// import type { RendererToMainEvents, MainToRendererEvents, DownloadRecord, AppSettings, ServerStatus } from '../shared/types';

// Polyfill for global
contextBridge.exposeInMainWorld('global', {});

// Add process.env for compatibility with some libraries
contextBridge.exposeInMainWorld('process', {
  env: {}
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Download management
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  
  deleteDownloads: (ids: string[]) => ipcRenderer.invoke('delete-downloads', ids),
  
  openFileLocation: (filePath: string) => ipcRenderer.invoke('open-file-location', filePath),

  retryDownload: (id: string) => ipcRenderer.invoke('retry-download', id),

  stopDownload: (id: string) => ipcRenderer.invoke('stop-download', id),

  getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),

  startDownload: (url:string, urlId:string) => ipcRenderer.invoke('start-download', url, urlId),

  openExternalUrl: (url:string) => ipcRenderer.invoke('open-external-url', url),

  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('save-settings', settings),
  
  resetSettings: () => ipcRenderer.invoke('reset-settings'),

  // Server management
  restartServer: () => ipcRenderer.invoke('restart-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),

  // Dependency management
  getDependencyVersion: (dependency: DependencyType) => ipcRenderer.invoke('get-dependency-version', dependency),

  checkForUpdates: (dependency: DependencyType) => ipcRenderer.invoke('check-for-updates', dependency),

  installDependency: (dependency: DependencyType) => ipcRenderer.invoke('install-dependency', dependency),

  // File system operations
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),

  // Window management
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  
  closeWindow: () => ipcRenderer.send('close-window'),
  
  showWindow: () => ipcRenderer.send('show-window'),

  // Event listeners for main process events
  onDownloadUpdated: (callback: (record: DownloadRecord) => void) => ipcRenderer.on('download-updated', (_, record) => callback(record)),
  onDownloadRetried: (callback: (record: DownloadRecord) => void) => ipcRenderer.on('download-retried', (_, record) => callback(record)),

  onServerStatusChanged: (callback: (status: ServerStatus) => void) => {
    ipcRenderer.on('server-status-changed', (_, status) => callback(status));
  },

  onSettingsUpdated: (callback: (settings: AppSettings) => void) => {
    ipcRenderer.on('settings-updated', (_, settings) => callback(settings));
  },

  onRefreshHistory: (callback: () => void) => {
    ipcRenderer.on('refresh-history', () => callback());
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

