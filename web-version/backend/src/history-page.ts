import type { DownloadRecordRow } from './database.js';
import type { AuthenticatedViewer } from './auth.js';
import type { HistoryPageViewProps } from '@shared/history-page';

export interface RenderHistoryPageOptions {
    items: DownloadRecordRow[];
    total: number;
    page: number;
    pageSize: number;
    selectedStatuses: string[];
    statusCounts: Record<string, number>;
    searchTerm?: string;
    wsPath?: string;
    checkFormatList: boolean;
    viewer?: AuthenticatedViewer | null;
}

export interface RenderLoginPageOptions {
    loginPath: string;
    errorMessage?: string;
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
    selectedStatuses,
    wsPath,
    checkFormatList,
    statusCounts,
    viewer
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
        checkFormatList,
        selectedStatuses,
        statusCounts,
        viewer: viewer ?? null
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

function escapeHtmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
        '    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8007866307816310" crossorigin="anonymous"></script>',
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

export function renderLoginPageToHtml({ loginPath, errorMessage }: RenderLoginPageOptions): string {
    const safeLoginPath = escapeHtmlAttribute(loginPath);
    const safeError = errorMessage ? escapeHtmlText(errorMessage) : '';
    const errorMarkup = safeError.length > 0
        ? `        <p class="auth-card__error" role="alert">${safeError}</p>`
        : '';

    return [
        '<!DOCTYPE html>',
        '<html lang="ko">',
        '<head>',
        '    <meta charSet="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '    <title>DuckTracker 로그인</title>',
        '    <link rel="stylesheet" href="/history/assets/history-page.css" />',
        '</head>',
        '<body>',
        '    <main class="auth-shell">',
        '        <section class="auth-card">',
        '            <span class="auth-card__eyebrow">Protected workspace</span>',
        '            <h1 class="auth-card__title">DuckTracker에 로그인하세요</h1>',
        '            <p class="auth-card__description">authentik 인증을 통과한 사용자만 다운로드 대시보드에 접근할 수 있습니다.</p>',
        errorMarkup,
        `            <a class="button button--primary auth-card__button" href="${safeLoginPath}">authentik으로 로그인</a>`,
        '        </section>',
        '    </main>',
        '</body>',
        '</html>'
    ].join('\n');
}

export type { HistoryPageViewProps } from '@shared/history-page';
