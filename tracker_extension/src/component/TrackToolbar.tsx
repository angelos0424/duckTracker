import React from 'react';
import { useHistoryService } from '../hooks/useHistoryService';
import './TrackToolbar.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faCheck, faDownload } from '@fortawesome/free-solid-svg-icons';

interface TrackToolbarProps {
  urlId: string;
}

export const TrackToolbar: React.FC<TrackToolbarProps> = ({ urlId }) => {
  const { saved, toggleHistory, download } = useHistoryService(urlId);

  return (
    <div className="video-toolbar">
      <button
        className={`save-history-btn ${saved ? 'saved' : ''}`}
        onClick={toggleHistory}
      >
        <FontAwesomeIcon icon={saved ? faCheck : faSave} />
      </button>
      <button
        className="download-btn"
        onClick={download}
      >
        <FontAwesomeIcon icon={faDownload} />
      </button>
    </div>
  );
};
