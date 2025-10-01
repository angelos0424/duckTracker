import type { HistoryPageBootstrap } from '../types';

export function ready(callback: () => void): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
        callback();
    }
}

export function parseBootstrapProps(elementId = 'history-props'): HistoryPageBootstrap | null {
    const propsElement = document.getElementById(elementId);
    if (!propsElement) {
        return null;
    }

    try {
        const raw = propsElement.textContent || '{}';
        return JSON.parse(raw) as HistoryPageBootstrap;
    } catch (error) {
        console.error('Failed to parse history props', error);
        return null;
    }
}
