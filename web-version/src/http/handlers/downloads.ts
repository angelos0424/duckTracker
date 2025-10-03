import type { IncomingMessage, ServerResponse } from 'node:http';
import { collectRequestBody } from '../body.js';
import { jsonResponse } from '../responses.js';
import { getDownloadState } from '../../database.js';
import type { DownloadManager, DownloadSnapshot } from '../../download-manager.js';
import type { ServerConfig } from '../../config.js';

interface DownloadHandlerDeps {
    downloadManager: DownloadManager;
    config: ServerConfig;
}

export function createDownloadHandlers({ downloadManager, config }: DownloadHandlerDeps) {
    function sendCurrentState(res: ServerResponse): void {
        const list = downloadManager.getStateList();
        jsonResponse(res, 200, list);
    }

    async function handleScheduleDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = await collectRequestBody(req);
            const targetUrl = body.url as string | undefined;
            const urlId = body.urlId as string | undefined;
            const title = (body.title as string | undefined) ?? '';
            const skipFormatCheck = true;
            const enforceFormatCheck = false;

            if (!targetUrl || !urlId) {
                jsonResponse(res, 400, { error: 'url and urlId are required' });
                return;
            }

            const existing = downloadManager.getState(urlId);
            if (existing && (existing.status === 'downloading' || existing.status === 'queued')) {
                jsonResponse(res, 200, existing);
                return;
            }

            console.info('[history] Received download schedule request', { urlId, targetUrl, title });

            const formatId = typeof body.formatId === 'string' ? body.formatId : undefined;

            const scheduleResult = await downloadManager.schedule({
                url: targetUrl,
                urlId,
                title,
                formatId,
                skipFormatCheck
            });

            if (enforceFormatCheck && scheduleResult.requiresFormatSelection) {
                const selectionState =
                    downloadManager.getState(urlId) || ({
                        url: targetUrl,
                        urlId,
                        title: scheduleResult.title || title || '',
                        status: 'format-select',
                        percent: 0,
                        formatOptions: scheduleResult.formatOptions || []
                    } as DownloadSnapshot);

                jsonResponse(res, 200, {
                    ...selectionState,
                    requiresFormatSelection: true,
                    queued: false
                });
                console.info('[history] Format selection required', {
                    urlId,
                    formatCount: scheduleResult.formatOptions?.length ?? 0
                });
                return;
            }

            const updatedState = downloadManager.getState(urlId);
            jsonResponse(res, 200, {
                ...(updatedState ?? {}),
                queued: scheduleResult.queued
            });
            console.info('[history] Download scheduled', { urlId, queued: scheduleResult.queued });
        } catch (error) {
            const err = error as Error;
            console.error('[history] handleDownload failed', { error: err.message, stack: err.stack });
            jsonResponse(res, 500, { error: err.message });
        }
    }

    async function handleStopDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = await collectRequestBody(req);
            const urlId = body.urlId as string | undefined;
            if (!urlId) {
                jsonResponse(res, 400, { error: 'urlId is required' });
                return;
            }

            const success = downloadManager.stop(urlId);
            if (!success) {
                jsonResponse(res, 404, { error: 'Download not found' });
                return;
            }

            const state = downloadManager.getState(urlId);
            jsonResponse(res, 200, state || { status: 'stop', urlId });
        } catch (error) {
            const err = error as Error;
            jsonResponse(res, 500, { error: err.message });
        }
    }

    async function handleRestartDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = await collectRequestBody(req);
            const urlId = body.urlId as string | undefined;
            if (!urlId) {
                jsonResponse(res, 400, { error: 'urlId is required' });
                return;
            }

            const currentState = downloadManager.getState(urlId);
            if (currentState && (currentState.status === 'downloading' || currentState.status === 'queued')) {
                jsonResponse(res, 200, currentState);
                return;
            }

            const record = getDownloadState(urlId);
            if (!record || !record.url) {
                jsonResponse(res, 404, { error: '다운로드 정보를 찾을 수 없습니다.' });
                return;
            }

            const scheduleResult = await downloadManager.schedule({
                url: record.url,
                urlId,
                title: record.title || ''
            });

            if (config.checkFormatList && scheduleResult.requiresFormatSelection) {
                const selectionState =
                    downloadManager.getState(urlId) || ({
                        url: record.url,
                        urlId,
                        title: scheduleResult.title ?? record.title ?? '',
                        status: 'format-select',
                        percent: 0,
                        formatOptions: scheduleResult.formatOptions || []
                    } as DownloadSnapshot);

                const options = scheduleResult.formatOptions ?? selectionState.formatOptions ?? [];
                jsonResponse(res, 200, {
                    requiresFormatSelection: true,
                    queued: false,
                    item: selectionState,
                    options,
                    title: selectionState.title,
                    url: record.url,
                    formatOptions: selectionState.formatOptions ?? options
                });
                return;
            }

            const updatedState =
                downloadManager.getState(urlId) || ({
                    url: record.url,
                    urlId,
                    title: record.title || '',
                    status: scheduleResult.queued ? 'queued' : 'downloading',
                    percent: 0
                } as DownloadSnapshot);

            jsonResponse(res, 200, { ...updatedState, queued: scheduleResult.queued });
        } catch (error) {
            const err = error as Error;
            jsonResponse(res, 500, { error: err.message });
        }
    }

    return {
        sendCurrentState,
        handleScheduleDownload,
        handleStopDownload,
        handleRestartDownload
    };
}
