import { useContext, useState, useEffect, useCallback } from 'react';
import { ServiceContext } from '../contexts/ServiceContext';
import {DownloadObject} from "../services/Observer";
import {ServerMessageStatus} from "../types";

export type BackgroundMessage = {
  action: string;
  text: {
    status: ServerMessageStatus;
    url: string;
    urlId: string;
    error?: string;
    percent?: number;
    title?: string;
  }
}

export const useHistoryService = (downloadObj: DownloadObject, isPlayList: boolean) => {
  const [saved, setSaved] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [percent, setPercent] = useState(0);
  const { toolbarService } = useContext(ServiceContext);
  const {url, urlId} = downloadObj;

  const handleMessage = useCallback((message: BackgroundMessage) => {
    if (message.action === 'download_status') {
      const data = message.text;
      const messageUrlId = data.urlId;

      if (messageUrlId !== urlId) return;

      if (data.status === 'completed') {
        setIsDownloading(false);
        setPercent(100);
        saveHistory();
      } else if (data.status === 'error') {
        setIsDownloading(false);
        alert(`Download failed: ${data.error}`);
      } else if (data.status === 'progress') {
        setPercent(data.percent || 0);
      } else {
        console.log('Unknown status:', data);
      }
    }
  }, [urlId]);

  useEffect(() => {
    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleMessage]);

  // 초기 저장 상태 확인
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'check', text: urlId }, res => {
      setSaved(res.success);
    });
  }, [urlId]);

  const saveHistory = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'save_history', text: downloadObj }, (response: any) => {
      setSaved(response.success);
    });
  }, [urlId]);

  const download = useCallback(() => {
    if (isDownloading) {
      if (window.confirm("다운로드를 중단하시겠습니까?")) {
        stopDownload();
      }
    } else {
      startDownload();
    }
  }, [isDownloading, urlId, isPlayList]);

  const startDownload = useCallback(() => {
    setIsDownloading(true);
    const message = {
      action: 'download',
      text: {
        action: 'download',
        url,
        urlId,
      }
    };
    chrome.runtime.sendMessage(message);
  }, [url, urlId, isPlayList]);

  const stopDownload = useCallback(() => {
    console.log("Stopping download for", urlId);
    chrome.runtime.sendMessage({ 
      action: 'stop_download',
      text: { 
        action: 'stop',
        urlId 
      }
    });
    setIsDownloading(false); // Optimistically update UI
  }, [urlId]);

  return { saved, isDownloading, saveHistory, download, percent };
};
