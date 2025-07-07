import React from 'react';
import { useHistoryService } from '../hooks/useHistoryService';

interface TrackToolbarProps {
  urlId: string;
}

export const TrackToolbar: React.FC<TrackToolbarProps> = ({ urlId }) => {
  const { saved, toggleHistory, download } = useHistoryService(urlId);

  return (
    <div className="video-toolbar">
      <button
        className="save-history-btn"
        onClick={toggleHistory}
      >
        {saved ? '저장완료' : '저장안됨'}
      </button>
      <button
        className="download-btn"
        onClick={download}
      >
        다운로드
      </button>
    </div>
  );
};
