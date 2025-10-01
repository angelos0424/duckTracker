import type { DownloadRecordRow } from './database.js';
import type { HistoryPageViewProps } from './history-page/types.js';

export interface RenderHistoryPageOptions {
    items: DownloadRecordRow[];
    total: number;
    page: number;
    pageSize: number;
    searchTerm?: string;
    wsPath?: string;
    checkFormatList: boolean;
}

function normaliseWsPath(path?: string): string {
    if (!path) {
        return '/';
    }
    return path.startsWith('/') ? path : `/${path}`;
}

function buildHistoryPageProps({
    items,
    total,
    page,
    pageSize,
    searchTerm,
    wsPath,
    checkFormatList
}: RenderHistoryPageOptions): HistoryPageViewProps {
    const safePageSize = Math.max(1, pageSize);
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const showingFrom = total === 0 ? 0 : (page - 1) * safePageSize + 1;
    const showingTo = Math.min(page * safePageSize, total);

    return {
        items,
        total,
        page,
        pageSize: safePageSize,
        totalPages,
        showingFrom,
        showingTo,
        searchTerm,
        wsPath: normaliseWsPath(wsPath),
        checkFormatList
    };
}

function escapeHtmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function serialisePropsForScript(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\u003C');
}

export function renderHistoryPageToHtml(options: RenderHistoryPageOptions): string {
    const props = buildHistoryPageProps(options);
    const propsJson = serialisePropsForScript(props);
    const wsPathAttr = escapeHtmlAttribute(props.wsPath);

    return [
        '<!DOCTYPE html>',
        '<html lang="ko">',
        '<head>',
        '    <meta charSet="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '    <title>다운로드 이력</title>',
        '    <link rel="stylesheet" href="/history/assets/history-page.css" />',
        '</head>',
        `<body data-ws-path="${wsPathAttr}">`,
        '    <div id="history-root"></div>',
        `    <script id="history-props" type="application/json">${propsJson}</script>`,
        '    <script src="/history/assets/history-client.js" defer></script>',
        '</body>',
        '</html>'
    ].join('');
}

export type { HistoryPageViewProps } from './history-page/types.js';
