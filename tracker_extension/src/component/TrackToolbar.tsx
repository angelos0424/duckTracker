import React from 'react';
import { useHistoryService } from '../hooks/useHistoryService';
import './TrackToolbar.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faCheck, faDownload, faSpinner } from '@fortawesome/free-solid-svg-icons';

interface TrackToolbarProps {
  urlId: string;
  isPlayList: boolean;
}

export const TrackToolbar: React.FC<TrackToolbarProps> = ({ urlId, isPlayList }) => {
  const { saved, isDownloading, toggleHistory, download } = useHistoryService(urlId, isPlayList);

  return (
    <div className="video-toolbar">
      <button
        className={`save-history-btn ${saved ? 'saved' : ''}`}
        onClick={toggleHistory}
        disabled={isDownloading} // 다운로드 중 비활성화
      >
        <FontAwesomeIcon icon={saved ? faCheck : faSave} />
      </button>
      <button
        className="download-btn"
        onClick={download}
        disabled={isDownloading} // 다운로드 중 비활성화
      >
        {isDownloading ? (
          <FontAwesomeIcon icon={faSpinner} spin />
        ) : (
          <FontAwesomeIcon icon={faDownload} />
        )}
      </button>
    </div>
  );
};
