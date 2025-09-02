import React, {useEffect} from 'react';
import { useHistoryService } from '../hooks/useHistoryService';
import './TrackToolbar.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {faSave, faCheck, faDownload, faSquare} from '@fortawesome/free-solid-svg-icons';
import {DownloadObject} from "../services/Observer";

interface TrackToolbarProps {
  els: DownloadObject;
  isPlayList: boolean;
}

export const TrackToolbar: React.FC<TrackToolbarProps> = ({ els, isPlayList }) => {
  const { saved, isDownloading, saveHistory, download, percent } = useHistoryService(els, isPlayList);

  const className = `video-toolbar`
  return (
    <div className={className}>
      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${percent}%` }}></div>
      </div>
      <button
        className={`save-history-btn ${saved ? 'saved' : ''}`}
        onClick={saveHistory}
        disabled={isDownloading} // 다운로드 중 비활성화
      >
        <FontAwesomeIcon icon={saved ? faCheck : faSave} />
      </button>
      <button
        className="download-btn"
        onClick={download}
      >
        {isDownloading ? (
          <FontAwesomeIcon icon={faSquare} spin style={{ color : 'red'}}/>
        ) : (
          <FontAwesomeIcon icon={faDownload} />
        )}
      </button>
    </div>
  );
};
