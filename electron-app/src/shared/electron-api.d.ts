import { DownloadRecord, AppSettings, ServerStatus } from './types';

// Define interfaces for complex return types
interface InstallDependencyResult {
  success: boolean;
  method: string;
  message: string;
}

interface OpenFolderDialogResult {
  canceled: boolean;
  filePaths: string[];
}

declare global {
  interface Window {
    electronAPI: {
      // Download management
      getDownloads: (query?: { status?: string }) => Promise<DownloadRecord[]>;
      deleteDownloads: (ids: string[]) => Promise<void>;
      openFileLocation: (filePath: string) => Promise<void>;
      retryDownload: (id: string) => Promise<void>;
      stopDownload: (id: string) => Promise<void>;
      getClipboardText: () => Promise<string>;
      startDownload: (url: string, urlId?: string) => Promise<void>;
      openExternalUrl: (url: string) => Promise<void>;

      // Settings management
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      resetSettings: () => Promise<AppSettings>;

      // Server management
      restartServer: () => Promise<void>;
      getServerStatus: () => Promise<ServerStatus>;

      // Dependency management
      getDependencyVersion: (dependency: 'yt-dlp' | 'ffmpeg') => Promise<string>;
      checkForUpdates: (dependency: 'yt-dlp' | 'ffmpeg') => Promise<string>;
      installDependency: (dependency: 'yt-dlp' | 'ffmpeg') => Promise<InstallDependencyResult>;

      // File system operations
      openFolderDialog: () => Promise<OpenFolderDialogResult>;

      // Window management
      minimizeWindow: () => void;
      closeWindow: () => void;
      showWindow: () => void;

      // Event listeners for main process events
      onDownloadUpdated: (callback: (record: DownloadRecord) => void) => void;
      onDownloadRetried: (callback: (record: DownloadRecord) => void) => void;
      onServerStatusChanged: (callback: (status: ServerStatus) => void) => void;
      onSettingsUpdated: (callback: (settings: AppSettings) => void) => void;
      onRefreshHistory: (callback: () => void) => void;

      // Remove listeners
      removeAllListeners: (channel: string) => void;
    };
  }
}
