import { useState, useEffect, useCallback } from 'react';
import { DownloadRecord } from '../../shared/types';
import { useIPC, useIPCEvents } from './useIPC';

export const useDownloads = () => {
    const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const ipc = useIPC();
    const ipcEvents = useIPCEvents();

    const fetchDownloads = useCallback(async () => {
        try {
            setLoading(true);
            const fetchedDownloads = await ipc.getDownloads('all');
            setDownloads(fetchedDownloads);
        } catch (error) {
            console.error('Failed to fetch downloads:', error);
        } finally {
            setLoading(false);
        }
    }, [ipc]);

    useEffect(() => {
        fetchDownloads();
    }, [fetchDownloads]);

    useEffect(() => {
        const handleDownloadUpdate = (record: DownloadRecord) => {
            setDownloads(prevDownloads => {
                const index = prevDownloads.findIndex(d => d.id === record.id);
                if (index !== -1) {
                    // Update existing record
                    const newDownloads = [...prevDownloads];
                    newDownloads[index] = record;
                    return newDownloads;
                } else {
                    // Add new record to the top
                    return [record, ...prevDownloads];
                }
            });
        };

        const cleanupUpdated = ipcEvents.onDownloadUpdated(handleDownloadUpdate);
        const cleanupRetried = ipcEvents.onDownloadRetried(handleDownloadUpdate);

        return () => {
            cleanupUpdated();
            cleanupRetried();
        };
    }, [ipcEvents]);

    const deleteDownloads = useCallback(async (ids: string[]) => {
        try {
            await ipc.deleteDownloads(ids);
            setDownloads(prev => prev.filter(d => !ids.includes(d.id)));
        } catch (error) {
            console.error('Failed to delete downloads:', error);
        }
    }, [ipc]);

    const retryDownload = useCallback(async (id: string) => {
        try {
            await ipc.retryDownload(id);
        } catch (error) {
            console.error('Failed to retry download:', error);
        }
    }, [ipc]);

    return { downloads, loading, fetchDownloads, deleteDownloads, retryDownload };
};
