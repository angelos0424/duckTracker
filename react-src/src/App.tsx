import React, { useState, useEffect, useCallback } from 'react';
import { ServerStatus, DownloadRecord } from './types/types';
import { useNeutralinoService } from './hooks/useNeutralinoService';
import DownloadHistory from './components/DownloadHistory';
import Settings from './components/Settings';
import Header from './components/Header';

type TabType = 'downloads' | 'settings';

interface AppState {
  downloads: DownloadRecord[];
  serverStatus: ServerStatus | null;
  selectedTab: TabType;
  loading: boolean;
  error: string | null;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    downloads: [],
    serverStatus: null,
    selectedTab: 'downloads',
    loading: true,
    error: null,
  });

  console.log('App called');
  const neutralinoService = useNeutralinoService();

  const initializeApp = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      console.log('initializeApp called');
      // const downloads:DownloadRecord[] = []; // Dummy data
      // const serverStatus = { running: true, httpPort: 8080, wsPort: 5000 }; // Dummy data

      const [downloads, serverStatus] = await Promise.all([
        neutralinoService.getHistories(),
        neutralinoService.getServerStatus(),
      ]);

      console.log('[App] downloads: ', downloads);
      console.log('[App] serverStatus: ', serverStatus);

      setState(prev => ({
        ...prev,
        downloads,
        serverStatus,
        loading: false,
      }));
    } catch (error) {
      console.error('initializeApp: Failed to initialize app:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false,
      }));
    }
  }, [neutralinoService]);

  useEffect(() => {
    initializeApp()
      .then(()=> {
        console.log('initializeApp success');
      });

    const unsubscribe = neutralinoService.onDownloadUpdated((updatedRecord) => {
      setState(prev => {
        // Find and update the existing record, or add a new one
        const existingIndex = prev.downloads.findIndex(d => d.url_id === updatedRecord.url_id);
        if (existingIndex > -1) {
          const newDownloads = [...prev.downloads];
          newDownloads[existingIndex] = { ...newDownloads[existingIndex], ...updatedRecord };
          return { ...prev, downloads: newDownloads };
        } else {
          // If it's a new download, add it to the beginning
          return { ...prev, downloads: [updatedRecord, ...prev.downloads] };
        }
      });
    });

    return () => {
      unsubscribe(); // Cleanup on unmount
    };
  }, [initializeApp, neutralinoService]);

  const handleRefreshDownloads = async () => {
    try {
      const downloads = await neutralinoService.getHistories();
      setState(prev => ({ ...prev, downloads }));
    } catch (error) {
      console.error('Failed to refresh downloads:', error);
    }
  };

  const handleDeleteDownloads = async (ids: string[]) => {
    try {
      await neutralinoService.deleteHistories(ids);
      setState(prev => ({
        ...prev,
        downloads: prev.downloads.filter(download => !ids.includes(download.url_id)),
      }));
    } catch (error) {
      console.error('Failed to delete downloads:', error);
    }
  };

  const handleOpenFileLocation = async (filePath: string) => {
    try {
      await neutralinoService.openFileLocation(filePath);
    } catch (error) {
      console.error('Failed to open file location:', error);
    }
  };

  const handleRetryDownload = async (url: string, urlId: string) => {
    try {
      await neutralinoService.startDownload(url, urlId);
    } catch (error) {
      console.error('Failed to retry download:', error);
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
      console.log('handleRestartServer called');
      await neutralinoService.restartServer();
    } catch (error) {
      console.error('Failed to restart server:', error);
    }
  };

  return (
    <div className="app">
      <Header
        serverStatus={state.serverStatus}
        onRefreshDownloads={handleRefreshDownloads}
        onMinimizeWindow={neutralinoService.minimizeWindow}
        onCloseWindow={neutralinoService.closeWindow}
        onRestartServer={handleRestartServer}
      />

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

      <div className="app-content">
        <div className="content-container">
          {state.selectedTab === 'downloads' && (
            <DownloadHistory
              downloads={state.downloads}
              onRefresh={handleRefreshDownloads}
              onDelete={handleDeleteDownloads}
              onOpenFile={handleOpenFileLocation}
              onRetry={handleRetryDownload}
              onAddDownload={neutralinoService.startDownload}
              onStopDownload={neutralinoService.stopDownload}
              onOpenExternalUrl={neutralinoService.openExternalUrl}
              getUrlFromClipboard={neutralinoService.getUrlFromClipboard}
            />
          )}
          {state.selectedTab === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
};

export default App;
