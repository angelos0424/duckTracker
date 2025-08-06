import {useEffect, useCallback, useRef, useMemo} from 'react';
import * as Neutralino from '@neutralinojs/lib';
import { ServerConfig, ServerStatus, DownloadRecord } from '../types/types';
import {events} from "@neutralinojs/lib";

interface NeutralinoService {
  getHistories: () => Promise<DownloadRecord[]>;
  getServerStatus: () => Promise<ServerStatus>;
  startDownload: (url: string, urlId: string) => Promise<void>;
  stopDownload: (id: string) => Promise<void>;
  deleteHistories: (ids: string[]) => Promise<void>;
  openFileLocation: (filePath: string) => Promise<void>;
  getSettings: () => Promise<ServerConfig>;
  saveSettings: (settings: ServerConfig) => Promise<void>;
  resetSettings: () => Promise<void>;
  restartServer: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  getUrlFromClipboard: () => Promise<string>;
  onDownloadUpdated: (callback: (record: DownloadRecord) => void) => () => void;
  onServerStatusChanged: (callback: (status: ServerStatus) => void) => () => void;
}

export const useNeutralinoService = (): NeutralinoService => {
  const downloadUpdateCallbacks = useRef<Set<(record: DownloadRecord) => void>>(new Set());
  const serverStatusCallbacks = useRef<Set<(status: ServerStatus) => void>>(new Set());
  
  const pendingRequests = useRef<Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>>(new Map());

  useEffect(() => {
    const handleBackendMessage = (event: CustomEvent) => {
      const data = event.detail;
      console.log('event', data)


      if (data.id && pendingRequests.current.has(data.id)) {
        const { resolve, reject } = pendingRequests.current.get(data.id)!;
        pendingRequests.current.delete(data.id);
        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data.data);
        }
      } else if (data.type === 'download-update') {
        console.log('download-update!!!!!!!!!', data.data)
        downloadUpdateCallbacks.current.forEach(callback => callback(data.data as DownloadRecord));
      } else if (data.type === 'serverStatusChanged') {
        serverStatusCallbacks.current.forEach(callback => callback(data.data));
      
      }
    };

    events.on('backend-send', handleBackendMessage);

    return () => {
      events.off('backend-send', handleBackendMessage);
    };
  }, []);

  const sendMessage = useCallback((type: string, data?: any): Promise<any> => {
    console.log(`[client] sendMessage: type=${type}, payload=${JSON.stringify(data)}`);
    return new Promise((resolve, reject) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 9); // Unique ID

      // 응답 대기.
      pendingRequests.current.set(id, { resolve, reject });

      Neutralino.events.broadcast('front-send', { type, data, id })
        .catch(error => {
          pendingRequests.current.delete(id);
          reject(error);
        });
    });
  }, []);

  const getHistories = useCallback(() => sendMessage('getHistories'), [sendMessage]);
  const getServerStatus = useCallback(() => sendMessage('getServerStatus'), [sendMessage]);
  const startDownload = useCallback((url: string, urlId: string) => sendMessage('startDownload', { url, urlId }), [sendMessage]);
  const stopDownload = useCallback((id: string) => sendMessage('stopDownload', { id }), [sendMessage]);
  const deleteHistories = useCallback((ids: string[]) => sendMessage('deleteHistories', { ids }), [sendMessage]);
  const openFileLocation = useCallback((filePath: string) => sendMessage('openFileLocation', { filePath }), [sendMessage]);
  const getSettings = useCallback(() => sendMessage('getSettings'), [sendMessage]);
  const saveSettings = useCallback((settings: ServerConfig) => sendMessage('saveSettings', { settings }), [sendMessage]);
  const resetSettings = useCallback(() => sendMessage('resetSettings'), [sendMessage]);
  const restartServer = useCallback(() => sendMessage('restartServer'), [sendMessage]);

  const minimizeWindow = useCallback(async () => {
    try {
      await Neutralino.window.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }, []);

  const closeWindow = useCallback(async () => {
    try {
      await Neutralino.app.exit();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  }, []);

  const openExternalUrl = useCallback(async (url: string) => {
    try {
      await Neutralino.os.open(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
    }
  }, []);

  const getUrlFromClipboard = useCallback(async () => {
    try {
      return await Neutralino.clipboard.readText();
    } catch (error) {
      console.error('Failed to read clipboard text:', error);
      return '';
    }
  }, []);

  const onDownloadUpdated = useCallback((callback: (record: DownloadRecord) => void) => {
    downloadUpdateCallbacks.current.add(callback);
    return () => downloadUpdateCallbacks.current.delete(callback);
  }, []);

  const onServerStatusChanged = useCallback((callback: (status: ServerStatus) => void) => {
    serverStatusCallbacks.current.add(callback);
    return () => serverStatusCallbacks.current.delete(callback);
  }, []);


  return useMemo(() => ({
    getHistories, // 다운로드 history.
    getServerStatus, // 서버 상태
    startDownload, // 다운로드 시작 요청
    stopDownload, // 다운로드 중지 요청
    deleteHistories, // 이력 삭제 요청
    openFileLocation, // 파일 열기
    getSettings,
    saveSettings,
    resetSettings,
    restartServer,
    minimizeWindow,
    closeWindow,
    openExternalUrl,
    getUrlFromClipboard,
    onDownloadUpdated,
    onServerStatusChanged,
  }), [
    getHistories,
    getServerStatus,
    startDownload,
    stopDownload,
    deleteHistories,
    openFileLocation,
    getSettings,
    saveSettings,
    resetSettings,
    restartServer,
    minimizeWindow,
    closeWindow,
    openExternalUrl,
    getUrlFromClipboard,
    onDownloadUpdated,
    onServerStatusChanged,
  ]);
};
