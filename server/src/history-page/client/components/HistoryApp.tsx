import { useCallback, useMemo, useState, type FC } from 'react';
import { HistoryTable } from '../../components/HistoryTable.js';
import { Pagination } from '../../components/Pagination.js';
import { SearchForm } from '../../components/SearchForm.js';
import type { HistoryPageBootstrap } from '../types.js';
import { AddDownloadDialog } from './AddDownloadDialog.js';
import { HistoryCardList } from '../../components/HistoryCardList.js';
import { useBusyMap } from '../hooks/useBusyMap.js';
import { useDialogState } from '../hooks/useDialogState.js';
import { useHistoryWebSocket } from '../hooks/useHistoryWebSocket.js';
import type { DownloadRequestResponse, HistoryItem } from '../types.js';
import { normaliseFormatOptions, validateUrl, deriveUrlId } from '../utils/format.js';
import {
    deleteHistory as deleteHistoryApi,
    fetchDownloadFile,
    removeFile as removeFileApi,
    requestDownload,
    resumeDownload as resumeDownloadApi,
    stopDownload as stopDownloadApi
} from '../services/historyApi.js';

type HistoryAppProps = HistoryPageBootstrap;

function cloneItems(items: HistoryItem[]): HistoryItem[] {
    return items.map((item) => ({ ...item }));
}

function toBooleanMap(source: Record<string, boolean>): Record<string, boolean> {
    return { ...source };
}

export const HistoryApp: FC<HistoryAppProps> = (props) => {
    const [items, setItems] = useState<HistoryItem[]>(() => cloneItems(props.items));
    const downloadBusy = useBusyMap();
    const stopBusy = useBusyMap();
    const resumeBusy = useBusyMap();
    const removeBusy = useBusyMap();
    const deleteBusy = useBusyMap();
    const formatBusy = useBusyMap();

    const dialog = useDialogState(props.checkFormatList);
    const dialogState = dialog.state;

    const updateItemState = useCallback((state: HistoryItem | null) => {

        if (!state || !state.urlId) {
            return;
        }
        setItems((previous) => {
            let found = false;
            const next = previous.map((entry) => {
                if (!entry || entry.urlId !== state.urlId) {
                    return entry;
                }
                found = true;
                const updated: HistoryItem = { ...entry };
                if (typeof state.title === 'string') {
                    updated.title = state.title;
                }
                if (typeof state.url === 'string') {
                    updated.url = state.url;
                }
                if (typeof state.status === 'string') {
                    updated.status = state.status;
                }
                if (Object.prototype.hasOwnProperty.call(state, 'filePath')) {
                    updated.filePath = typeof state.filePath === 'string' ? state.filePath : null;
                }
                if (Object.prototype.hasOwnProperty.call(state, 'fileSizeBytes')) {
                    const raw = state.fileSizeBytes;
                    if (raw === null || raw === undefined) {
                        updated.fileSizeBytes = null;
                    } else {
                        const numeric = Number(raw);
                        updated.fileSizeBytes = Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
                    }
                }
                if (Object.prototype.hasOwnProperty.call(state, 'error')) {
                    updated.lastError = state.error ? String((state as unknown as { error?: string }).error) : '';
                }
                if (Object.prototype.hasOwnProperty.call(state, 'lastError')) {
                    updated.lastError = state.lastError ? String(state.lastError) : '';
                }
                if (Object.prototype.hasOwnProperty.call(state, 'formatOptions')) {
                    updated.formatOptions = Array.isArray(state.formatOptions)
                        ? normaliseFormatOptions(state.formatOptions)
                        : undefined;
                }
                if (Object.prototype.hasOwnProperty.call(state, 'percent')) {
                    const numeric = Number(state.percent);
                    updated.percent = Number.isFinite(numeric) ? numeric : 0;
                }
                return updated;
            });

            if (found) {
                return next;
            }

            if (state.status === 'format-select') {
                return previous;
            }

            const initialEntry: HistoryItem = {
                urlId: state.urlId,
                url: typeof state.url === 'string' ? state.url : '',
                title: typeof state.title === 'string' ? state.title : '',
                status: typeof state.status === 'string' ? state.status : 'queued',
                createdAt: state.createdAt || new Date().toISOString(),
                updatedAt: state.updatedAt || new Date().toISOString(),
                filePath: typeof state.filePath === 'string' ? state.filePath : null,
                fileSizeBytes: Number.isFinite(Number(state.fileSizeBytes)) ? Number(state.fileSizeBytes) : null,
                percent: Number.isFinite(Number(state.percent)) ? Number(state.percent) : 0,
                formatOptions: Array.isArray(state.formatOptions) ? normaliseFormatOptions(state.formatOptions) : undefined
            };

            return [initialEntry, ...previous];
        });
    }, []);

    const handleRemoveFileAfterDownload = useCallback(
        async (urlId: string, background: boolean) => {
            try {
                const state = await removeFileApi(urlId);
                if (state) {
                    updateItemState(state);
                }
            } catch (error) {
                if (!background) {
                    window.alert((error as Error).message || '다운로드 후 파일 삭제에 실패했습니다.');
                }
            }
        },
        [updateItemState]
    );

    const handleDownload = useCallback(
        async (urlId: string) => {
            if (!urlId || downloadBusy.state[urlId]) {
                return;
            }
            downloadBusy.setBusy(urlId, true);
            try {
                const { blob, filename } = await fetchDownloadFile(urlId);
                const objectUrl = URL.createObjectURL(blob);
                let revoked = false;
                const revoke = () => {
                    if (revoked) {
                        return;
                    }
                    revoked = true;
                    try {
                        URL.revokeObjectURL(objectUrl);
                    } catch {
                        // ignore
                    }
                };
                const revokeTimeout = window.setTimeout(revoke, 120000);
                window.addEventListener(
                    'pagehide',
                    () => {
                        window.clearTimeout(revokeTimeout);
                        revoke();
                    },
                    { once: true }
                );

                const isIos =
                    /iP(ad|hone|od)/i.test(window.navigator.userAgent) ||
                    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
                const supportsDownloadAttribute = 'download' in HTMLAnchorElement.prototype && !isIos;
                let navigatedAway = false;

                if (supportsDownloadAttribute) {
                    const anchor = document.createElement('a');
                    anchor.href = objectUrl;
                    anchor.download = filename;
                    anchor.rel = 'noopener';
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                } else {
                    const openedWindow = window.open(objectUrl, '_blank', 'noopener');
                    if (!openedWindow) {
                        navigatedAway = true;
                        window.location.href = objectUrl;
                    }
                }

                if (navigatedAway) {
                    void handleRemoveFileAfterDownload(urlId, true);
                } else {
                    await handleRemoveFileAfterDownload(urlId, false);
                }
            } catch (error) {
                window.alert((error as Error).message || '파일을 다운로드할 수 없습니다.');
            } finally {
                downloadBusy.setBusy(urlId, false);
            }
        },
        [downloadBusy, handleRemoveFileAfterDownload]
    );

    const handleRemoveFile = useCallback(
        async (urlId: string) => {
            if (!urlId || removeBusy.state[urlId]) {
                return;
            }
            if (!window.confirm('이력은 유지하고 서버에 저장된 파일만 삭제합니다. 계속하시겠습니까?')) {
                return;
            }
            removeBusy.setBusy(urlId, true);
            try {
                const state = await removeFileApi(urlId);
                if (state) {
                    updateItemState(state);
                }
            } catch (error) {
                window.alert((error as Error).message || '파일 삭제에 실패했습니다.');
            } finally {
                removeBusy.setBusy(urlId, false);
            }
        },
        [removeBusy, updateItemState]
    );

    const handleDelete = useCallback(
        async (urlId: string) => {
            if (!urlId || deleteBusy.state[urlId]) {
                return;
            }
            if (!window.confirm('정말로 이 다운로드 이력을 삭제하시겠습니까? 파일도 함께 삭제됩니다.')) {
                return;
            }
            deleteBusy.setBusy(urlId, true);
            try {
                await deleteHistoryApi(urlId);
                window.location.reload();
            } catch (error) {
                window.alert((error as Error).message || '삭제에 실패했습니다.');
            } finally {
                deleteBusy.setBusy(urlId, false);
            }
        },
        [deleteBusy]
    );

    const handleStop = useCallback(
        async (urlId: string) => {
            if (!urlId || stopBusy.state[urlId]) {
                return;
            }
            stopBusy.setBusy(urlId, true);
            try {
                const state = await stopDownloadApi(urlId);
                if (state) {
                    updateItemState(state);
                }
            } catch (error) {
                window.alert((error as Error).message || '다운로드 정지에 실패했습니다.');
            } finally {
                stopBusy.setBusy(urlId, false);
            }
        },
        [stopBusy, updateItemState]
    );

    const handleResume = useCallback(
        async (urlId: string) => {
            if (!urlId || resumeBusy.state[urlId]) {
                return;
            }
            resumeBusy.setBusy(urlId, true);
            try {
                const response = await resumeDownloadApi(urlId);
                if (!response) {
                    return;
                }
                if ((response as DownloadRequestResponse).requiresFormatSelection) {
                    const data = response as DownloadRequestResponse;
                    const nextItem = (data.item ?? null) as HistoryItem | null;
                    if (nextItem) {
                        updateItemState(nextItem);
                    }
                    if (props.checkFormatList) {
                        const options = normaliseFormatOptions(
                            data.options ?? data.formatOptions ?? data.item?.formatOptions ?? []
                        );
                        dialog.openFormatSelection({
                            options,
                            title: data.title || nextItem?.title || '',
                            urlId,
                            url: data.url || nextItem?.url || ''
                        });
                        formatBusy.setBusy(urlId, false);
                        return;
                    }
                } else if ((response as HistoryItem).status) {
                    updateItemState(response as HistoryItem);
                }
            } catch (error) {
                window.alert((error as Error).message || '다운로드 재시작에 실패했습니다.');
            } finally {
                resumeBusy.setBusy(urlId, false);
            }
        },
        [dialog, formatBusy, props.checkFormatList, resumeBusy, updateItemState]
    );

    const handleFormatSelectionRequest = useCallback(
        (urlId: string) => {
            if (!props.checkFormatList) {
                void handleDownload(urlId);
                return;
            }
            const match = items.find((entry) => entry && entry.urlId === urlId);
            if (!match) {
                window.alert('선택할 항목을 찾을 수 없습니다.');
                return;
            }
            const options = normaliseFormatOptions(match.formatOptions ?? []);
            if (options.length === 0) {
                window.alert('선택 가능한 포맷이 없습니다. 잠시 후 다시 시도해주세요.');
                return;
            }
            dialog.openFormatSelection({
                options,
                title: typeof match.title === 'string' ? match.title : '',
                urlId: urlId,
                url: typeof match.url === 'string' ? match.url : ''
            });
        },
        [dialog, handleDownload, items, props.checkFormatList]
    );

    const handleDialogSubmit = useCallback(async () => {
        if (dialogState.mode === 'format') {
            if (!dialogState.formatUrlId) {
                dialog.setError('선택할 항목을 찾을 수 없습니다.');
                return;
            }
            if (!dialogState.selectedFormatId) {
                dialog.setError('다운로드할 포맷을 선택해주세요.');
                return;
            }
            const selectedOption = dialogState.formatOptions.find((option) => option.id === dialogState.selectedFormatId);
            if (!selectedOption) {
                dialog.setError('선택한 포맷을 찾을 수 없습니다.');
                return;
            }
            dialog.setError('');
            dialog.setSubmitting(true);
            const urlId = dialogState.formatUrlId;
            formatBusy.setBusy(urlId, true);
            try {
                let finalFormatId = selectedOption.id;
                if (!finalFormatId.includes('+') && selectedOption.isAudioOnly !== true) {
                    const audioCandidates = dialogState.formatOptions.filter((option) => option.isAudioOnly);
                    if (audioCandidates.length > 0) {
                        const selectedExt = (selectedOption.ext || '').toLowerCase();
                        const candidates = selectedExt
                            ? audioCandidates.filter(
                                  (option) => (option.ext || '').toLowerCase() === selectedExt
                              )
                            : [];

                        if (candidates.length > 0) {
                            const bestAudio = candidates.reduce((best, current) => {
                                if (!best) {
                                    return current;
                                }

                                const bestTbr = typeof best.tbr === 'number' && Number.isFinite(best.tbr) ? best.tbr : -1;
                            const currentTbr =
                                typeof current.tbr === 'number' && Number.isFinite(current.tbr) ? current.tbr : -1;
                            if (currentTbr !== bestTbr) {
                                return currentTbr > bestTbr ? current : best;
                            }

                            const bestSize =
                                typeof best.filesize === 'number' && Number.isFinite(best.filesize) ? best.filesize : -1;
                            const currentSize =
                                typeof current.filesize === 'number' && Number.isFinite(current.filesize)
                                    ? current.filesize
                                    : -1;
                            if (currentSize !== bestSize) {
                                return currentSize > bestSize ? current : best;
                            }

                            return best;
                            }, candidates[0]);

                            if (bestAudio && bestAudio.id && bestAudio.id !== selectedOption.id) {
                                finalFormatId = `${selectedOption.id}+${bestAudio.id}`;
                            }
                        }
                    }
                }

                const payload = {
                    url: dialogState.urlValue,
                    urlId,
                    formatId: finalFormatId
                };
                const data = await requestDownload(payload);
                if (data && data.requiresFormatSelection) {
                    const nextItem = (data.item ?? null) as HistoryItem | null;
                    if (nextItem) {
                        updateItemState(nextItem);
                    }
                    const options = normaliseFormatOptions(
                        data.options ?? data.formatOptions ?? data.item?.formatOptions ?? []
                    );
                    if (options.length === 0) {
                        dialog.setError('선택 가능한 포맷이 없습니다. 잠시 후 다시 시도해주세요.');
                        dialog.setSubmitting(false);
                        dialog.openFormatSelection({
                            options,
                            title: data.title || '',
                            urlId,
                            url: dialogState.urlValue
                        });
                        formatBusy.setBusy(urlId, false);
                        return;
                    }
                    dialog.openFormatSelection({
                        options,
                        title: data.title || '',
                        urlId,
                        url: dialogState.urlValue
                    });
                    dialog.setSubmitting(false);
                    formatBusy.setBusy(urlId, false);
                    return;
                }
                dialog.closeDialog();
                window.location.reload();
            } catch (error) {
                window.alert((error as Error).message || '다운로드 요청에 실패했습니다.');
            } finally {
                dialog.setSubmitting(false);
                if (dialogState.formatUrlId) {
                    formatBusy.setBusy(dialogState.formatUrlId, false);
                }
            }
            return;
        }

        const trimmed = dialogState.urlValue.trim();
        if (!validateUrl(trimmed)) {
            dialog.setError('유효한 URL을 입력해주세요.');
            return;
        }
        const derivedId = deriveUrlId(trimmed);
        dialog.setError('');
        dialog.setUrlValue(trimmed);
        dialog.setSubmitting(true);
        try {
            const data = await requestDownload({ url: trimmed, urlId: derivedId });
            if (data && data.requiresFormatSelection) {
                const nextItem = (data.item ?? null) as HistoryItem | null;
                if (nextItem) {
                    updateItemState(nextItem);
                }
                const options = normaliseFormatOptions(
                    data.options ?? data.formatOptions ?? data.item?.formatOptions ?? []
                );
                if (props.checkFormatList) {
                    dialog.openFormatSelection({
                        options,
                        title: data.title || '',
                        urlId: data.item?.urlId || derivedId,
                        url: trimmed
                    });
                    dialog.setSubmitting(false);
                    return;
                }
            }
            dialog.closeDialog();
            window.location.reload();
        } catch (error) {
            window.alert((error as Error).message || '다운로드 요청에 실패했습니다.');
        } finally {
            dialog.setSubmitting(false);
        }
    }, [dialog, dialogState, formatBusy, props.checkFormatList, updateItemState]);

    useHistoryWebSocket(props.wsPath, updateItemState);

    const summary = useMemo(
        () => ({
            total: props.total,
            showingFrom: props.showingFrom,
            showingTo: props.showingTo,
            page: props.page,
            pageSize: props.pageSize,
            totalPages: props.totalPages,
            searchTerm: props.searchTerm || ''
        }),
        [props.page, props.pageSize, props.searchTerm, props.showingFrom, props.showingTo, props.total, props.totalPages]
    );

    return (
        <>
            <div className="history-shell">
                <header className="history-shell__header">
                    <div>
                        <h1 className="history-shell__title">다운로드 관리</h1>
                        <p className="history-shell__subtitle">파일 다운로드 상태를 확인하고 관리하세요.</p>
                    </div>
                    <div className="history-shell__header-actions">
                        <button type="button" className="button button--ghost" disabled>
                            관리
                        </button>
                    </div>
                </header>
                <div className="history-toolbar">
                    <SearchForm searchTerm={summary.searchTerm} />
                    <div className="history-toolbar__actions">
                        <button
                            type="button"
                            className="button button--outline"
                            data-action="refresh"
                            onClick={() => window.location.reload()}
                        >
                            새로고침
                        </button>
                        <button
                            type="button"
                            className="button button--primary"
                            data-action="open-add-dialog"
                            onClick={dialog.openDialog}
                        >
                            다운로드 추가
                        </button>
                    </div>
                </div>
                <div className="history-table-wrapper">
                    <div className="history-table-scroll">
                        <HistoryTable
                            items={items}
                            enableFormatSelection={props.checkFormatList}
                            handlers={{
                                onDownload: handleDownload,
                                onStop: handleStop,
                                onResume: handleResume,
                                onRemoveFile: handleRemoveFile,
                                onDelete: handleDelete,
                                onSelectFormat: handleFormatSelectionRequest
                            }}
                            pending={{
                                download: toBooleanMap(downloadBusy.state),
                                stop: toBooleanMap(stopBusy.state),
                                resume: toBooleanMap(resumeBusy.state),
                                remove: toBooleanMap(removeBusy.state),
                                delete: toBooleanMap(deleteBusy.state),
                                format: dialogState.mode === 'format' && dialogState.formatUrlId
                                    ? { [dialogState.formatUrlId]: dialogState.isSubmitting }
                                    : toBooleanMap(formatBusy.state)
                            }}
                        />
                    </div>
                </div>
                <HistoryCardList
                    items={items}
                    enableFormatSelection={props.checkFormatList}
                    handlers={{
                        onDownload: handleDownload,
                        onStop: handleStop,
                        onResume: handleResume,
                        onRemoveFile: handleRemoveFile,
                        onDelete: handleDelete,
                        onSelectFormat: handleFormatSelectionRequest
                    }}
                    pending={{
                        download: toBooleanMap(downloadBusy.state),
                        stop: toBooleanMap(stopBusy.state),
                        resume: toBooleanMap(resumeBusy.state),
                        remove: toBooleanMap(removeBusy.state),
                        delete: toBooleanMap(deleteBusy.state),
                        format: dialogState.mode === 'format' && dialogState.formatUrlId
                            ? { [dialogState.formatUrlId]: dialogState.isSubmitting }
                            : toBooleanMap(formatBusy.state)
                    }}
                />
                <div className="history-summary">
                    <span className="history-summary__info">
                        총 {summary.total.toLocaleString()}건 중 {summary.showingFrom.toLocaleString()}-{summary.showingTo.toLocaleString()} 표시
                    </span>
                    <Pagination
                        page={summary.page}
                        totalPages={summary.totalPages}
                        pageSize={summary.pageSize}
                        searchTerm={summary.searchTerm}
                    />
                </div>
            </div>
            <AddDownloadDialog
                open={dialogState.open}
                mode={dialogState.mode}
                urlValue={dialogState.urlValue}
                errorMessage={dialogState.errorMessage}
                isSubmitting={dialogState.isSubmitting}
                enableFormatSelection={props.checkFormatList}
                formatOptions={dialogState.formatOptions}
                selectedFormatId={dialogState.selectedFormatId}
                formatTitle={dialogState.formatTitle}
                onClose={dialog.closeDialog}
                onSubmit={handleDialogSubmit}
                onUrlChange={dialog.setUrlValue}
                onSelectFormat={dialog.selectFormat}
                onBack={dialogState.mode === 'format' ? dialog.backToUrl : undefined}
            />
        </>
    );
};
