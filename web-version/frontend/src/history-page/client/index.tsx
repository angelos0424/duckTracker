import { createRoot } from 'react-dom/client';
import { ready, parseBootstrapProps } from './utils/dom.js';
import { HistoryApp } from './components/HistoryApp.js';

ready(() => {
    const props = parseBootstrapProps();
    if (!props) {
        return;
    }

    const rootElement = document.getElementById('history-root');
    if (!rootElement) {
        return;
    }

    const root = createRoot(rootElement);
    root.render(<HistoryApp {...props} />);
});
