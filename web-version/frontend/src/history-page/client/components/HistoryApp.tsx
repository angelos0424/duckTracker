import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
    HistoryTable,
    type HistoryTableSortColumn,
    type HistoryTableSortDirection,
    type HistoryTableSortState
} from '../../components/HistoryTable.js';
import { Pagination } from '../../components/Pagination.js';
import { SearchForm } from '../../components/SearchForm.js';
import { StatusFilterControls, type StatusFilterOption } from '../../components/StatusFilterControls.js';
import type { HistoryPageBootstrap } from '../types.js';
import { AddDownloadDialog } from './AddDownloadDialog.js';
import { HistoryCardList } from '../../components/HistoryCardList.js';
import { PlaybackWindow } from './PlaybackWindow.js';
import { useBusyMap } from '../hooks/useBusyMap.js';
import { useDialogState } from '../hooks/useDialogState.js';
import { useHistoryWebSocket } from '../hooks/useHistoryWebSocket.js';
import type { DownloadRequestResponse, HistoryItem } from '../types.js';
import { normaliseFormatOptions, validateUrl, deriveUrlId } from '../utils/format.js';
import { getStatusLabel } from '../../utils/status.js';
import {
    deleteHistory as deleteHistoryApi,
    fetchDownloadFile,
    removeFile as removeFileApi,
    requestDownload,
    resumeDownload as resumeDownloadApi,
    stopDownload as stopDownloadApi
} from '../services/historyApi.js';

type HistoryAppProps = HistoryPageBootstrap;

const STATUS_DISPLAY_ORDER: readonly string[] = [
    'downloading',
    'queued',
    'completed',
    'format-select',
    'stop',
    'error',
    'unknown'
];

function compareStringValues(
    left: string | undefined | null,
    right: string | undefined | null,
    direction: HistoryTableSortDirection,
    locale: string
): number {
    const leftValue = (left ?? '').trim();
    const rightValue = (right ?? '').trim();
    const hasLeft = leftValue.length > 0;
    const hasRight = rightValue.length > 0;

    if (!hasLeft && !hasRight) {
        return 0;
    }
    if (!hasLeft) {
        return 1;
    }
    if (!hasRight) {
        return -1;
    }

    return direction === 'asc'
        ? leftValue.localeCompare(rightValue, locale)
        : rightValue.localeCompare(leftValue, locale);
}

function compareNumberValues(
    left: number | null | undefined,
    right: number | null | undefined,
    direction: HistoryTableSortDirection
): number {
    const hasLeft = typeof left === 'number' && Number.isFinite(left);
    const hasRight = typeof right === 'number' && Number.isFinite(right);

    if (!hasLeft && !hasRight) {
        return 0;
    }
    if (!hasLeft) {
        return 1;
    }
    if (!hasRight) {
        return -1;
    }

    if (left === right) {
        return 0;
    }

    return direction === 'asc' ? (left as number) - (right as number) : (right as number) - (left as number);
}

function toTimestamp(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function compareHistoryItems(
    left: HistoryItem,
    right: HistoryItem,
    sortState: HistoryTableSortState
): number {
    switch (sortState.column) {
        case 'title':
            return compareStringValues(left.title, right.title, sortState.direction, 'ko');
        case 'status':
            return compareStringValues(
                getStatusLabel(left.status),
                getStatusLabel(right.status),
                sortState.direction,
                'ko'
            );
        case 'percent': {
            const leftPercent = typeof left.percent === 'number' ? left.percent : Number(left.percent);
            const rightPercent = typeof right.percent === 'number' ? right.percent : Number(right.percent);
            return compareNumberValues(leftPercent, rightPercent, sortState.direction);
        }
        case 'fileSizeBytes':
            return compareNumberValues(left.fileSizeBytes, right.fileSizeBytes, sortState.direction);
        case 'createdAt':
            return compareNumberValues(toTimestamp(left.createdAt), toTimestamp(right.createdAt), sortState.direction);
        case 'updatedAt':
            return compareNumberValues(toTimestamp(left.updatedAt), toTimestamp(right.updatedAt), sortState.direction);
        default:
            return 0;
    }
}

function cloneItems(items: HistoryItem[]): HistoryItem[] {
    return items.map((item) => ({ ...item }));
}

function toBooleanMap(source: Record<string, boolean>): Record<string, boolean> {
    return { ...source };
}

interface PlaybackSession {
    urlId: string;
    title: string;
    cacheKey: number;
}

export const HistoryApp: FC<HistoryAppProps> = (props) => {
    const [items, setItems] = useState<HistoryItem[]>(() => cloneItems(props.items));
    const downloadBusy = useBusyMap();
    const stopBusy = useBusyMap();
    const resumeBusy = useBusyMap();
    const removeBusy = useBusyMap();
    const deleteBusy = useBusyMap();
    const formatBusy = useBusyMap();
    const [playback, setPlayback] = useState<PlaybackSession | null>(null);
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [sortState, setSortState] = useState<HistoryTableSortState | null>(null);

    const dialog = useDialogState(props.checkFormatList);
    const dialogState = dialog.state;

    const pageStatusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const item of items) {
            const key = item.status ?? 'unknown';
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }, [items]);

    const statusCounts = useMemo(() => {
        const mergedCounts: Record<string, number> = { ...props.statusCounts };
        const pageEntries = Object.entries(pageStatusCounts);
        for (const [statusKey, count] of pageEntries) {
            if (!(statusKey in mergedCounts)) {
                mergedCounts[statusKey] = count;
            }
        }
        return mergedCounts;
    }, [pageStatusCounts, props.statusCounts]);

    const statusOptions = useMemo<StatusFilterOption[]>(() => {
        const remaining = new Set(Object.keys(statusCounts));
        const ordered: StatusFilterOption[] = STATUS_DISPLAY_ORDER.map((statusKey) => {
            const count = statusCounts[statusKey] ?? 0;
            const option: StatusFilterOption = {
                value: statusKey,
                label: getStatusLabel(statusKey),
                count
            };
            remaining.delete(statusKey);
            return option;
        });

        const dynamicOptions: StatusFilterOption[] = Array.from(remaining)
            .sort((a, b) => getStatusLabel(a).localeCompare(getStatusLabel(b), 'ko'))
            .map((statusKey) => ({
                value: statusKey,
                label: getStatusLabel(statusKey),
                count: statusCounts[statusKey] ?? 0
            }));

        return [...ordered, ...dynamicOptions].filter((option, index, array) => {
            if (option.value === 'unknown') {
                return option.count > 0;
            }
            return array.findIndex((entry) => entry.value === option.value) === index;
        });
    }, [statusCounts]);

    const selectedStatusLabels = useMemo(() => {
        if (statusFilter.length === 0) {
            return '';
        }
        const labelMap = new Map(statusOptions.map((option) => [option.value, option.label] as const));
        return statusFilter
            .map((value) => labelMap.get(value) ?? getStatusLabel(value))
            .join(', ');
    }, [statusFilter, statusOptions]);

    useEffect(() => {
        setStatusFilter((previous) => {
            if (previous.length === 0) {
                return previous;
            }
            const available = new Set(statusOptions.map((option) => option.value));
            const next = previous.filter((value) => available.has(value));
            return next.length === previous.length ? previous : next;
        });
    }, [statusOptions]);

    const visibleItems = useMemo(() => {
        const filterSet = new Set(statusFilter);
        const shouldFilter = filterSet.size > 0;
        const filtered = shouldFilter
            ? items.filter((item) => {
                  const statusValue = item.status ?? 'unknown';
                  return filterSet.has(statusValue);
              })
            : items;

        if (!sortState) {
            return filtered;
        }

        return filtered
            .map((item, index) => ({ item, index }))
            .sort((left, right) => {
                const comparison = compareHistoryItems(left.item, right.item, sortState);
                if (comparison !== 0) {
                    return comparison;
                }
                return left.index - right.index;
            })
            .map((entry) => entry.item);
    }, [items, sortState, statusFilter]);

    const handleStatusToggle = useCallback((statusValue: string) => {
        setStatusFilter((previous) => {
            if (previous.includes(statusValue)) {
                return previous.filter((entry) => entry !== statusValue);
            }
            return [...previous, statusValue];
        });
    }, []);

    const handleSortRequest = useCallback(
        (column: HistoryTableSortColumn, direction: HistoryTableSortDirection) => {
            setSortState((previous) => {
                if (previous && previous.column === column && previous.direction === direction) {
                    return null;
                }
                return { column, direction };
            });
        },
        []
    );

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

    const handleOpenBrowser = useCallback((url: string) => {
        if (!url) {
            return;
        }

        window.open(url, '_blank', 'noopener');
    }, []);

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

    const handlePlay = useCallback(
        (urlId: string) => {
            const item = items.find((entry) => entry.urlId === urlId);
            if (!item || !item.filePath) {
                window.alert('재생할 수 있는 파일이 없습니다. 다운로드가 완료되었는지 확인해주세요.');
                return;
            }

            const safeTitle = item.title?.trim() || '(제목 없음)';
            setPlayback({ urlId, title: safeTitle, cacheKey: Date.now() });
        },
        [items]
    );

    const handleClosePlayback = useCallback(() => {
        setPlayback(null);
    }, []);

    const handleReloadPlayback = useCallback(() => {
        setPlayback((previous) => (previous ? { ...previous, cacheKey: Date.now() } : previous));
    }, []);

    useEffect(() => {
        if (!playback) {
            return;
        }
        setPlayback((previous) => {
            if (!previous) {
                return previous;
            }
            const item = items.find((entry) => entry.urlId === previous.urlId);
            if (!item || !item.filePath) {
                return null;
            }
            const nextTitle = item.title?.trim() || '(제목 없음)';
            if (nextTitle !== previous.title) {
                return { ...previous, title: nextTitle };
            }
            return previous;
        });
    }, [items, playback?.urlId]);

    const playbackStreamUrl = useMemo(() => {
        if (!playback) {
            return '';
        }
        const base = `/history/${encodeURIComponent(playback.urlId)}/stream`;
        return `${base}?v=${playback.cacheKey}`;
    }, [playback]);

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
                        <h1 className="history-shell__title">DuckTracker</h1>
                    </div>
                </header>
                <div className="history-toolbar">
                    <div className="history-toolbar__filters">
                        <SearchForm searchTerm={summary.searchTerm} />
                        <StatusFilterControls
                            options={statusOptions}
                            selected={statusFilter}
                            onStatusToggle={handleStatusToggle}
                        />
                    </div>
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
                <div className="history-content">
                    <div className="history-content__scroll">
                        <div className="history-table-wrapper">
                            <div className="history-table-scroll">
                                <HistoryTable
                                    items={visibleItems}
                                    enableFormatSelection={props.checkFormatList}
                                    handlers={{
                                        onDownload: handleDownload,
                                        onStop: handleStop,
                                        onResume: handleResume,
                                        onRemoveFile: handleRemoveFile,
                                        onDelete: handleDelete,
                                        onSelectFormat: handleFormatSelectionRequest,
                                        onOpenBrowser: handleOpenBrowser,
                                        onPlay: handlePlay
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
                                    sortState={sortState}
                                    onRequestSort={handleSortRequest}
                                />
                            </div>
                        </div>
                        <div className="history-card-region">
                            <HistoryCardList
                                items={visibleItems}
                                enableFormatSelection={props.checkFormatList}
                                handlers={{
                                    onDownload: handleDownload,
                                    onStop: handleStop,
                                    onResume: handleResume,
                                    onRemoveFile: handleRemoveFile,
                                    onDelete: handleDelete,
                                    onSelectFormat: handleFormatSelectionRequest,
                                    onOpenBrowser: handleOpenBrowser,
                                    onPlay: handlePlay
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
                </div>
                <div className="history-summary">
                    <span className="history-summary__info">
                        <span>
                            총 {summary.total.toLocaleString()}건 중 {summary.showingFrom.toLocaleString()}-{summary.showingTo.toLocaleString()} 표시
                        </span>
                        {statusFilter.length > 0 ? (
                            <span className="history-summary__filtered-count">
                                필터 결과 {visibleItems.length.toLocaleString()}건
                                {selectedStatusLabels ? (
                                    <span className="history-summary__filtered-meta">선택된 상태: {selectedStatusLabels}</span>
                                ) : null}
                            </span>
                        ) : null}
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
            {playback ? (
                <PlaybackWindow
                    urlId={playback.urlId}
                    title={playback.title}
                    streamUrl={playbackStreamUrl}
                    onClose={handleClosePlayback}
                    onReload={handleReloadPlayback}
                />
            ) : null}
        </>
    );
};
