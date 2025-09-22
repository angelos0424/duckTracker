import { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '../../shared/types';
import { useIPC, useIPCEvents } from './useIPC';

export const useSettings = () => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const ipc = useIPC();
    const ipcEvents = useIPCEvents();

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const fetchedSettings = await ipc.getSettings();
            setSettings(fetchedSettings);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        } finally {
            setLoading(false);
        }
    }, [ipc]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        const cleanup = ipcEvents.onSettingsUpdated((newSettings) => {
            setSettings(newSettings);
        });
        return cleanup;
    }, [ipcEvents]);

    const saveSettings = useCallback(async (newSettings: AppSettings) => {
        try {
            await ipc.saveSettings(newSettings);
            setSettings(newSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            // Optionally re-fetch settings to revert optimistic update
            fetchSettings();
        }
    }, [ipc, fetchSettings]);

    const resetSettings = useCallback(async () => {
        try {
            const defaultSettings = await ipc.resetSettings();
            setSettings(defaultSettings);
        } catch (error) {
            console.error('Failed to reset settings:', error);
        }
    }, [ipc]);

    return { settings, loading, saveSettings, resetSettings };
};
