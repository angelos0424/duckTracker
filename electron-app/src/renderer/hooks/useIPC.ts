/// <reference path="../../../src/shared/electron-api.d.ts" />
import {useMemo} from 'react';
import {AppSettings, DownloadRecord, ServerStatus} from '../../shared/types';

// Custom hook for IPC communication with main process
export const useIPC = () => {
  return useMemo(() => {
    // Download management
    const getDownloads = (status: string): Promise<DownloadRecord[]> => {
      return window.electronAPI.getDownloads({status});
    };

    const deleteDownloads = (ids: string[]): Promise<void> => {
      return window.electronAPI.deleteDownloads(ids);
    };

    const openFileLocation = (filePath: string): Promise<void> => {
      return window.electronAPI.openFileLocation(filePath);
    };

    const retryDownload = (id: string): Promise<void> => {
      return window.electronAPI.retryDownload(id);
    };

    const stopDownload = (id: string): Promise<void> => {
      console.log('stopDownload', id);
      return window.electronAPI.stopDownload(id);
    };

    const getClipboardText = (): Promise<string> => {
      return window.electronAPI.getClipboardText();
    };

    const startDownload = (url: string, urlId: string): Promise<void> => {
      return window.electronAPI.startDownload(url, urlId);
    };

    const openExternalUrl = (url: string): Promise<void> => {
      return window.electronAPI.openExternalUrl(url);
    };

    // Settings management
    const getSettings = (): Promise<AppSettings> => {
      return window.electronAPI.getSettings();
    };

    const saveSettings = (settings: AppSettings): Promise<void> => {
      return window.electronAPI.saveSettings(settings);
    };

    const resetSettings = (): Promise<AppSettings> => {
      return window.electronAPI.resetSettings();
    };

    // Server management
    const restartServer = (): Promise<void> => {
      return window.electronAPI.restartServer();
    };

    const getServerStatus = (): Promise<ServerStatus> => {
      return window.electronAPI.getServerStatus();
    };

    const getDependencyVersion = (dependency: 'yt-dlp' | 'ffmpeg'): Promise<string> => {
      return window.electronAPI.getDependencyVersion(dependency);
    }

    // Window management
    const minimizeWindow = (): void => {
      window.electronAPI.minimizeWindow();
    };

    const closeWindow = (): void => {
      window.electronAPI.closeWindow();
    };

    const showWindow = (): void => {
      window.electronAPI.showWindow();
    };

    return {
      // Download operations
      getDownloads,
      deleteDownloads,
      openFileLocation,
      retryDownload,
      stopDownload,
      getClipboardText,
      startDownload,
      openExternalUrl,
      getSettings,
      saveSettings,
      resetSettings,
      restartServer,
      getServerStatus,
      getDependencyVersion,
      minimizeWindow,
      closeWindow,
      showWindow,
    };
  }, []);
};

// Custom hook for listening to main process events
export const useIPCEvents = () => {
  return useMemo(() => {
    const onDownloadUpdated = (callback: (record: DownloadRecord) => void) => {
      window.electronAPI.onDownloadUpdated(callback);
      return () => window.electronAPI.removeAllListeners('download-updated');
    };

    const onServerStatusChanged = (callback: (status: ServerStatus) => void) => {
      window.electronAPI.onServerStatusChanged(callback);
      return () => window.electronAPI.removeAllListeners('server-status-changed');
    };

    const onSettingsUpdated = (callback: (settings: AppSettings) => void) => {
      window.electronAPI.onSettingsUpdated(callback);
      return () => window.electronAPI.removeAllListeners('settings-updated');
    };

    const onDownloadRetried = (callback: (record: DownloadRecord) => void) => {
      window.electronAPI.onDownloadRetried(callback);
      return () => window.electronAPI.removeAllListeners('download-retried');
    };

    const onRefreshHistory = (callback: () => void) => {
      window.electronAPI.onRefreshHistory(callback);
      return () => window.electronAPI.removeAllListeners('refresh-history');
    };

    return {
      onDownloadUpdated,
      onServerStatusChanged,
      onSettingsUpdated,
      onDownloadRetried,
      onRefreshHistory,
    };
  }, []);
};