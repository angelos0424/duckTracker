import * as React from 'react';
import { useDownloads } from './hooks/useDownloads';
import { useSettings } from './hooks/useSettings';
import DownloadHistory from './components/DownloadHistory';
import Settings from './components/Settings';
import { useIPC } from './hooks/useIPC';

type TabType = 'downloads' | 'settings';

const App: React.FC = () => {
    const [selectedTab, setSelectedTab] = React.useState<TabType>('downloads');
    const { downloads, loading: downloadsLoading, deleteDownloads, retryDownload, fetchDownloads } = useDownloads();
    const { settings, loading: settingsLoading, saveSettings, resetSettings } = useSettings();
    const [ytDlpVersion, setYtDlpVersion] = React.useState('loading...');
    const [ffmpegVersion, setFfmpegVersion] = React.useState('loading...');
    const ipc = useIPC();

    const refreshVersions = React.useCallback(async () => {
        try {
            const [ytDlp, ffmpeg] = await Promise.all([
                ipc.getDependencyVersion('yt-dlp'),
                ipc.getDependencyVersion('ffmpeg'),
            ]);
            setYtDlpVersion(ytDlp);
            setFfmpegVersion(ffmpeg);
        } catch (error) {
            console.error('Failed to fetch dependency versions:', error);
            setYtDlpVersion('Error');
            setFfmpegVersion('Error');
        }
    }, [ipc]);

    React.useEffect(() => {
        refreshVersions();
    }, [refreshVersions]);

    if (downloadsLoading || settingsLoading) {
        return <div className="app-loading"><div className="loading-spinner">Loading...</div></div>;
    }

    return (
        <div className="app">
            <div className="app-header">
                <div className="header-left">
                    <h1>YouTube Downloader</h1>
                    <div className="app-version">v1.0.0</div>
                </div>
            </div>

            <div className="app-tabs">
                <div className="tabs-container">
                    <button
                        className={`tab ${selectedTab === 'downloads' ? 'active' : ''}`}
                        onClick={() => setSelectedTab('downloads')}
                    >
                        <span className="tab-icon">📥</span>
                        <span className="tab-text">Downloads</span>
                        {downloads.length > 0 && (
                            <span className="tab-badge">{downloads.length}</span>
                        )}
                    </button>
                    <button
                        className={`tab ${selectedTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setSelectedTab('settings')}
                    >
                        <span className="tab-icon">⚙️</span>
                        <span className="tab-text">Settings</span>
                    </button>
                </div>
            </div>

            <div className="app-content">
                <div className="content-container">
                    {selectedTab === 'downloads' && (
                        <DownloadHistory
                            downloads={downloads}
                            onDelete={deleteDownloads}
                            onRetry={retryDownload}
                            onOpenFile={ipc.openFileLocation}
                            onRefresh={fetchDownloads}
                        />
                    )}
                    {selectedTab === 'settings' && settings && (
                        <Settings
                            settings={settings}
                            onSave={saveSettings}
                            onReset={resetSettings}
                            ytDlpVersion={ytDlpVersion}
                            ffmpegVersion={ffmpegVersion}
                            onRefreshVersions={refreshVersions}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
