import React from 'react';

interface HeaderProps {
  serverStatus: {
    running: boolean;
    httpPort?: number;
    wsPort?: number;
    error?: string;
  } | null;
  onRefreshDownloads: () => void;
  onMinimizeWindow: () => void;
  onCloseWindow: () => void;
  onRestartServer: () => void;
}

const Header: React.FC<HeaderProps> = ({
  serverStatus,
  onRefreshDownloads,
  onMinimizeWindow,
  onCloseWindow,
  onRestartServer,
}) => {
  const getServerStatusText = () => {
    console.log('getServerStatusText called', serverStatus);
    if (!serverStatus) return 'Unknown';
    if (serverStatus.running) {
      return `Running (HTTP: ${serverStatus.httpPort}, WS: ${serverStatus.wsPort})`;
    }
    return serverStatus.error ? `Error: ${serverStatus.error}` : 'Stopped';
  };

  const getServerStatusClass = () => {
    if (!serverStatus) return 'status-unknown';
    if (serverStatus.running) return 'status-running';
    return serverStatus.error ? 'status-error' : 'status-stopped';
  };

  return (
    <div className="app-header">
      <div className="header-left">
        <h1>YouTube Downloader</h1>
        <div className="app-version">v1.0.0</div>
      </div>
      <div className="header-right">
        <div className="server-status-container">
          <div className={`server-status ${getServerStatusClass()}`}>
            <div className="status-indicator"></div>
            <span className="status-text">{getServerStatusText()}</span>
          </div>
          <button 
            className="restart-server-button"
            onClick={onRestartServer}
            title="Restart Server"
          >
            ↻
          </button>
        </div>
        <div className="header-actions">
          <button 
            className="refresh-all-button"
            onClick={onRefreshDownloads}
            title="Refresh Downloads"
          >
            ⟳
          </button>
          <button 
            className="minimize-button"
            onClick={onMinimizeWindow}
            title="Minimize to Tray"
          >
            −
          </button>
          <button 
            className="close-button"
            onClick={onCloseWindow}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};

export default Header;
