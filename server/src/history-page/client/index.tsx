import { ready, parseBootstrapProps } from './utils/dom';
import type { HistoryPageBootstrap } from './types';
import { HistoryApp } from './components/HistoryApp';

ready(() => {
    if (typeof window === 'undefined') {
        return;
    }

    if (!window.React || !window.ReactDOM) {
        console.error('React and ReactDOM must be loaded before history client initialises.');
        return;
    }

    const props = parseBootstrapProps();
    if (!props) {
        return;
    }

    const rootElement = document.getElementById('history-root');
    if (!rootElement) {
        return;
    }

    const reactInstance = window.React;
    const reactDomInstance = window.ReactDOM;
    reactDomInstance.hydrateRoot(rootElement, reactInstance.createElement(HistoryApp, props as HistoryPageBootstrap));
});
