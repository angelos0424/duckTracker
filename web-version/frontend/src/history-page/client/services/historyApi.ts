import type { DownloadRequestResponse, HistoryItem, RequestDownloadPayload } from '../types.js';
import { extractFilename } from '../utils/format.js';

async function parseJson<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch (_error) {
        return null;
    }
}

export async function requestDownload(payload: RequestDownloadPayload & { urlId?: string }): Promise<DownloadRequestResponse> {
    const response = await fetch('/history/request-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, enforceFormatCheck: typeof payload?.formatId !== 'string' })
    });
    const data = (await parseJson<DownloadRequestResponse>(response)) ?? {};
    if (!response.ok) {
        throw new Error(data.error || '다운로드 요청에 실패했습니다.');
    }
    return data;
}

export async function fetchDownloadFile(urlId: string): Promise<{ blob: Blob; filename: string }>
{
    const response = await fetch(`/history/${encodeURIComponent(urlId)}/file`, { method: 'GET' });
    if (!response.ok) {
        const data = (await parseJson<{ error?: string }>(response)) ?? {};
        throw new Error(data.error || '파일을 다운로드할 수 없습니다.');
    }
    const blob = await response.blob();
    const filename = extractFilename(response, `${urlId}.bin`);
    return { blob, filename };
}

export async function removeFile(urlId: string): Promise<HistoryItem | null> {
    const response = await fetch(`/history/${encodeURIComponent(urlId)}/file`, { method: 'DELETE' });
    if (response.status === 404) {
        return null;
    }
    const data = await parseJson<HistoryItem>(response);
    if (!response.ok) {
        const error = (data as unknown as { error?: string })?.error;
        throw new Error(error || '파일 삭제에 실패했습니다.');
    }
    return data;
}

export async function deleteHistory(urlId: string): Promise<void> {
    const response = await fetch(`/history/${encodeURIComponent(urlId)}`, { method: 'DELETE' });
    const data = await parseJson<{ error?: string }>(response);
    if (!response.ok) {
        throw new Error((data && data.error) || '삭제에 실패했습니다.');
    }
}

export async function stopDownload(urlId: string): Promise<HistoryItem | null> {
    const response = await fetch('/stop_download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlId })
    });
    const data = await parseJson<HistoryItem>(response);
    if (!response.ok) {
        const error = (data as unknown as { error?: string })?.error;
        throw new Error(error || '다운로드 정지에 실패했습니다.');
    }
    return data;
}

export async function resumeDownload(urlId: string): Promise<DownloadRequestResponse | HistoryItem | null> {
    const response = await fetch('/restart_download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlId })
    });
    const data = await parseJson<DownloadRequestResponse & HistoryItem>(response);
    if (!response.ok) {
        const error = (data as unknown as { error?: string })?.error;
        throw new Error(error || '다운로드 재시작에 실패했습니다.');
    }
    return data;
}
