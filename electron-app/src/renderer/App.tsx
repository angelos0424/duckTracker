import * as React from 'react';
import { DownloadRecord, AppSettings, ServerStatus } from '../shared/types';
import { useIPC, useIPCEvents } from './hooks/useIPC';
import DownloadHistory from './components/DownloadHistory';
import Settings from './components/Settings';

type TabType = 'downloads' | 'settings';

interface AppState {
  downloads: DownloadRecord[];
  settings: AppSettings | null;
  serverStatus: ServerStatus | null;
  selectedTab: TabType;
  loading: boolean;
  error: string | null;
  ytDlpVersion: string;
  ffmpegVersion: string;
}

const App: React.FC = () => {
  const [state, setState] = React.useState<AppState>({
    downloads: [],
    settings: null,
    serverStatus: null,
    selectedTab: 'downloads',
    loading: true,
    error: null,
    ytDlpVersion: 'loading...',
    ffmpegVersion: 'loading...',
  });

  const ipc = useIPC();
  const ipcEvents = useIPCEvents();

  const refreshVersions = React.useCallback(async () => {
    try {
      const [ytDlpVersion, ffmpegVersion] = await Promise.all([
        ipc.getDependencyVersion('yt-dlp'),
        ipc.getDependencyVersion('ffmpeg'),
      ]);
      setState(prev => ({ ...prev, ytDlpVersion, ffmpegVersion }));
    } catch (error) {
      console.error('Failed to fetch dependency versions:', error);
      setState(prev => ({ ...prev, ytDlpVersion: 'Error', ffmpegVersion: 'Error' }));
    }
  }, [ipc]);

  // Initialize app data
  React.useEffect(() => {
    const initializeApp = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        
        // Load initial data
        const [downloads, settings, serverStatus] = await Promise.all([
          ipc.getDownloads(''),
          ipc.getSettings(),
          ipc.getServerStatus(), // Get initial server status
        ]);

        setState(prev => ({
          ...prev,
          downloads,
          settings,
          serverStatus, // Set initial server status
          loading: false,
        }));
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Unknown error',
          loading: false,
        }));
      }
    };

    initializeApp();
  }, [ipc]);

  // Fetch dependency versions asynchronously
  React.useEffect(() => {
    refreshVersions();
  }, [refreshVersions]);

  // Set up event listeners
  React.useEffect(() => {
    const cleanupFunctions: (() => void)[] = [];

    // Server status events
    cleanupFunctions.push(
      ipcEvents.onServerStatusChanged((status) => {
        setState(prev => ({ ...prev, serverStatus: status }));
      })
    );

    // Settings updated events
    cleanupFunctions.push(
      ipcEvents.onSettingsUpdated((settings) => {
        setState(prev => ({ ...prev, settings }));
      })
    );

    // Refresh history event
    cleanupFunctions.push(
      ipcEvents.onRefreshHistory(() => {
        handleRefreshDownloads();
      })
    );

    // Cleanup on unmount
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [ipcEvents]);

  // Handler functions
  const handleRefreshDownloads = async () => {
    try {
      const downloads = await ipc.getDownloads('');
      setState(prev => ({ ...prev, downloads }));
    } catch (error) {
      console.error('Failed to refresh downloads:', error);
    }
  };

  const  handleDeleteDownloads = async (ids: string[]) => {
    try {
      await ipc.deleteDownloads(ids);
      setState(prev => ({
        ...prev,
        downloads: prev.downloads.filter(download => !ids.includes(download.id)),
      }));
    } catch (error) {
      console.error('Failed to delete downloads:', error);
    }
  };

  const handleOpenFileLocation = async (filePath: string) => {
    try {
      await ipc.openFileLocation(filePath);
    } catch (error) {
      console.error('Failed to open file location:', error);
    }
  };

  const handleRetryDownload = async (id: string) => {
    try {
      console.log('App.tsx handleRetryDownload: Retrying download with ID:')
      await ipc.retryDownload(id);
    } catch (error) {
      console.error('Failed to retry download:', error);
    }
  };

  const handleSaveSettings = async (settings: AppSettings) => {
    try {
      await ipc.saveSettings(settings);
      setState(prev => ({ ...prev, settings }));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleResetSettings = async () => {
    try {
      const settings = await ipc.resetSettings();
      setState(prev => ({ ...prev, settings }));
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };

  if (state.loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="app-error">
        <h2>Error</h2>
        <p>{state.error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  const handleRestartServer = async () => {
    try {
      await ipc.restartServer();
    } catch (error) {
      console.error('Failed to restart server:', error);
    }
  };

  const getServerStatusText = () => {
    if (!state.serverStatus) return 'Unknown';
    if (state.serverStatus.running) {
      return `Running (PORT: ${state.serverStatus.httpPort})`;
    }
    return state.serverStatus.error ? `Error: ${state.serverStatus.error}` : 'Stopped';
  };

  const getServerStatusClass = () => {
    if (!state.serverStatus) return 'status-unknown';
    if (state.serverStatus.running) return 'status-running';
    return state.serverStatus.error ? 'status-error' : 'status-stopped';
  };

  return (
    <div className="app">
      {/* Enhanced Header with server status and controls */}
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
              onClick={handleRestartServer}
              title="Restart Server"
            >
              ↻
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Tab Navigation */}
      <div className="app-tabs">
        <div className="tabs-container">
          <button
            className={`tab ${state.selectedTab === 'downloads' ? 'active' : ''}`}
            onClick={() => setState(prev => ({ ...prev, selectedTab: 'downloads' }))}
          >
            <span className="tab-icon">📥</span>
            <span className="tab-text">Downloads</span>
            {state.downloads.length > 0 && (
              <span className="tab-badge">{state.downloads.length}</span>
            )}
          </button>
          <button
            className={`tab ${state.selectedTab === 'settings' ? 'active' : ''}`}
            onClick={() => setState(prev => ({ ...prev, selectedTab: 'settings' }))}
          >
            <span className="tab-icon">⚙️</span>
            <span className="tab-text">Settings</span>
          </button>
        </div>
        <div className="tab-indicator"></div>
      </div>

      {/* Responsive Content Area */}
      <div className="app-content">
        <div className="content-container">
          {state.selectedTab === 'downloads' && (
            <DownloadHistory
              downloads={state.downloads}
              onRefresh={handleRefreshDownloads}
              onDelete={handleDeleteDownloads}
              onOpenFile={handleOpenFileLocation}
              onRetry={handleRetryDownload}
            />
          )}
          {state.selectedTab === 'settings' && state.settings && (
            <Settings
              settings={state.settings}
              onSave={handleSaveSettings}
              onReset={handleResetSettings}
              ytDlpVersion={state.ytDlpVersion}
              ffmpegVersion={state.ffmpegVersion}
              onRefreshVersions={refreshVersions}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;