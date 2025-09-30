import * as React from 'react';

interface AppHeaderProps {
    running: boolean;
    port: number | undefined;
    error: string | undefined;
    restartPending: boolean;
    onRestart: () => Promise<void>;
}

const AppHeader: React.FC<AppHeaderProps> = ({ running, port, error, restartPending, onRestart }) => (
    <div className="app-header">
        <div className="header-left">
            <h1>YouTube Downloader</h1>
            <div className="app-version">v1.0.0</div>
        </div>
        <div className="header-right">
            <div className="server-status">
                <span className={`status-indicator ${running ? 'online' : 'offline'}`}></span>
                <div className="status-text">
                    <span className="status-label">{running ? 'Server Online' : 'Server Offline'}</span>
                    <span className="status-ports">Port {port ?? '—'}</span>
                </div>
                {error && (
                    <span className="status-error" title={error}>!</span>
                )}
            </div>
            <button
                className="restart-button"
                onClick={onRestart}
                disabled={restartPending}
                title="Restart server"
            >
                <span className="restart-icon">⟳</span>
                <span className="restart-text">{restartPending ? 'Restarting…' : 'Restart'}</span>
            </button>
        </div>
    </div>
);

export default AppHeader;
