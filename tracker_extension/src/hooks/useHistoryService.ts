import { useContext, useState, useEffect, useCallback } from 'react';
import { ServiceContext } from '../contexts/ServiceContext';

export const useHistoryService = (urlId: string) => {
  const [saved, setSaved] = useState(false);
  // ServiceContext에서 필요한 서비스 (여기서는 직접 사용하지 않지만, 예시를 위해 포함)
  const { toolbarService } = useContext(ServiceContext);

  // 초기 저장 상태 확인
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'check', text: urlId }, res => {
      setSaved(res.success);
    });
  }, [urlId]);

  // 저장/저장 해제 토글
  const toggleHistory = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'save_history', text: urlId }, (response: any) => {
      setSaved(response.success);
    });
  }, [urlId]);

  // 다운로드
  const download = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'download', text: urlId }, response => {
      setSaved(response.success);
      if (!response.success) {
        alert(response.error);
      }
    });
  }, [urlId]);

  return { saved, toggleHistory, download };
};
