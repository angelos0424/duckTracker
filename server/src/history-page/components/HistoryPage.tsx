import React from 'react';
import type { HistoryPageViewProps } from '../types';
import { HistoryAppShell } from './HistoryAppShell';

function escapeJsonForScript(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003C');
}

export const HistoryPage: React.FC<HistoryPageViewProps> = (props) => (
    <html lang="ko">
        <head>
            <meta charSet="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>다운로드 이력</title>
            <link rel="stylesheet" href="/history/assets/history-page.css" />
        </head>
        <body data-ws-path={props.wsPath || '/'}>
            <div id="history-root">
                <HistoryAppShell {...props} />
            </div>
            <script
                id="history-props"
                type="application/json"
                dangerouslySetInnerHTML={{ __html: escapeJsonForScript(props) }}
            />
            <script src="/history/assets/react.production.min.js"></script>
            <script src="/history/assets/react-dom.production.min.js"></script>
            <script src="/history/assets/history-client.js"></script>
        </body>
    </html>
);
