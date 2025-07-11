import React, { useEffect, useState } from 'react';
import './SidePanel.css';

interface DownloadRecord {
  filename: string;
  timestamp: number;
}

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SidePanel: React.FC<SidePanelProps> = ({ isOpen, onClose }) => {
  const [downloadHistory, setDownloadHistory] = useState<DownloadRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
      chrome.storage.local.get(['downloadProgress'], (result) => {
        console.log("SidePanel: Raw result from storage:", result);
        console.log("SidePanel: Retrieved download history:", result.downloadProgress);
        setDownloadHistory(Array.isArray(result.downloadProgress) ? result.downloadProgress : []);
      });

      const handleClickOutside = (event: MouseEvent) => {
        const panelElement = document.querySelector('.side-panel');
        if (panelElement && !panelElement.contains(event.target as Node)) {
          onClose();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  return (
    <div className={`side-panel ${isOpen ? 'open' : ''}`}>
      <div className="side-panel-header">
        <h2>Download History</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="side-panel-content">
        {downloadHistory.length === 0 ? (
          <p>No downloads yet.</p>
        ) : (
          <ul>
            {downloadHistory.map((record, index) => (
              <li key={index}>
                <strong>{record.filename}</strong> - {new Date(record.timestamp).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
