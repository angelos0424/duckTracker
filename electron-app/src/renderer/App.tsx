import * as React from 'react';
import { useDownloads } from './hooks/useDownloads';
import { useSettings } from './hooks/useSettings';
import DownloadHistory from './components/DownloadHistory';
import Settings from './components/Settings';
import AppHeader from './components/AppHeader';
import AppTabs from './components/AppTabs';
import { useIPC, useIPCEvents } from './hooks/useIPC';
import { ServerStatus } from '../shared/types';

type TabType = 'downloads' | 'settings';

const App: React.FC = () => {
    const [selectedTab, setSelectedTab] = React.useState<TabType>('downloads');
    const { downloads, loading: downloadsLoading, deleteDownloads, retryDownload, fetchDownloads } = useDownloads();
    const { settings, loading: settingsLoading, saveSettings, resetSettings } = useSettings();
    const [ytDlpVersion, setYtDlpVersion] = React.useState('loading...');
    const [ffmpegVersion, setFfmpegVersion] = React.useState('loading...');
    const ipc = useIPC();
    const ipcEvents = useIPCEvents();
    const [serverStatus, setServerStatus] = React.useState<ServerStatus | null>(null);
    const [restartPending, setRestartPending] = React.useState(false);

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

    React.useEffect(() => {
        let active = true;
        const loadStatus = async () => {
            try {
                const status = await ipc.getServerStatus();
                if (active) {
                    setServerStatus(status);
                }
            } catch (error) {
                console.error('Failed to fetch server status:', error);
                if (active) {
                    setServerStatus({
                        running: false,
                        httpPort: settings?.httpPort,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        };

        loadStatus();
        const unsubscribe = ipcEvents.onServerStatusChanged((status) => {
            setServerStatus(status);
            setRestartPending(false);
        });

        return () => {
            active = false;
            unsubscribe?.();
        };
    }, [ipc, ipcEvents, settings?.httpPort]);

    const handleRestartServer = React.useCallback(async () => {
        setRestartPending(true);
        try {
            await ipc.restartServer();
            const status = await ipc.getServerStatus();
            setServerStatus(status);
        } catch (error) {
            console.error('Failed to restart server:', error);
            setServerStatus((prev) => ({
                running: false,
                httpPort: prev?.httpPort ?? settings?.httpPort,
                error: error instanceof Error ? error.message : 'Failed to restart server'
            }));
        } finally {
            setRestartPending(false);
        }
    }, [ipc, settings?.httpPort]);

    const statusRunning = serverStatus?.running ?? false;
    const port = serverStatus?.httpPort ?? settings?.httpPort ?? 8080;

    if (downloadsLoading || settingsLoading) {
        return <div className="app-loading"><div className="loading-spinner">Loading...</div></div>;
    }

    return (
        <div className="app">
            <AppHeader
                running={statusRunning}
                port={port}
                error={serverStatus?.error}
                restartPending={restartPending}
                onRestart={handleRestartServer}
            />

            <AppTabs
                selected={selectedTab}
                downloadsCount={downloads.length}
                onSelect={(tab) => setSelectedTab(tab)}
            />

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
