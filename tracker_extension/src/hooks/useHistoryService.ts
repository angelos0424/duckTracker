import { useContext, useState, useEffect, useCallback } from 'react';
import { ServiceContext } from '../contexts/ServiceContext';

export const useHistoryService = (urlId: string, isPlayList: boolean) => {
  const [saved, setSaved] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toolbarService } = useContext(ServiceContext);

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === 'download_status') {
        const data = message.text;
        const messageUrlId = new URL(data.url).searchParams.get('v');
        if (messageUrlId !== urlId) return;

        if (data.status === 'completed') {
          setIsDownloading(false);
          toggleHistory();
        } else if (data.status === 'error') {
          setIsDownloading(false);
          alert(`Download failed: ${data.error}`);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [urlId]);

  // 초기 저장 상태 확인
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'check', text: urlId }, res => {
      setSaved(res.success);
    });
  }, [urlId]);

  const toggleHistory = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'save_history', text: urlId }, (response: any) => {
      setSaved(response.success);
    });
  }, [urlId]);

  const download = useCallback(() => {
    setIsDownloading(true);
    const message = {
      action: 'download',
      text: {
        action: 'download',
        url: isPlayList ? urlId : `https://www.youtube.com/watch?v=${urlId}`,
      }
    };
    chrome.runtime.sendMessage(message);
  }, [urlId, isPlayList]);

  return { saved, isDownloading, toggleHistory, download };
};
