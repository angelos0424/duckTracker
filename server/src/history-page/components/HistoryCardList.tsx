import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryItem } from '../types.js';
import { formatFileSize, getProgressFromItem } from '../utils/format.js';
import { getStatusLabel } from '../utils/status.js';
import type { ActionsCellHandlers, ActionsCellState } from './ActionsCell.js';
import { ActionsCell } from './ActionsCell.js';
import { ProgressCell } from './ProgressCell.js';

interface PendingMaps {
    download?: Record<string, boolean>;
    stop?: Record<string, boolean>;
    resume?: Record<string, boolean>;
    remove?: Record<string, boolean>;
    delete?: Record<string, boolean>;
    format?: Record<string, boolean>;
}

interface HistoryCardListProps {
    items: HistoryItem[];
    enableFormatSelection?: boolean;
    handlers?: ActionsCellHandlers;
    pending?: PendingMaps;
}

interface HistoryCardRowProps {
    item: HistoryItem;
    enableFormatSelection?: boolean;
    handlers?: ActionsCellHandlers;
    pendingState: ActionsCellState;
}

const SWIPE_TRIGGER_PX = 96;
const SWIPE_MAX_PX = 140;
const SWIPE_COMMIT_DELAY = 140;

const HistoryCardRow: React.FC<HistoryCardRowProps> = ({
    item,
    enableFormatSelection,
    handlers,
    pendingState
}) => {
    const urlId = item.urlId || '';
    const status = item.status || 'unknown';
    const statusClass = `status-badge status-${status}`;
    const title = item.title?.trim() || '';
    const progressValue = getProgressFromItem(item);
    const fileSizeText = formatFileSize(item.fileSizeBytes);
    const fileSizeTitle =
        fileSizeText && typeof item.fileSizeBytes === 'number'
            ? `${item.fileSizeBytes.toLocaleString()} bytes`
            : undefined;
    const fileAvailable = Boolean(item.filePath);
    const downloadDisabled = !fileAvailable || status !== 'completed';
    const downloadTitle = downloadDisabled
        ? '완료된 항목만 다운로드할 수 있습니다.'
        : '파일 다운로드';
    const createdAt = item.createdAt || '-';
    const deleteDisabled = Boolean(pendingState.isDeletePending);

    const [offset, setOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isAnimating, setIsAnimating] = useState(true);
    const pointerIdRef = useRef<number | null>(null);
    const startXRef = useRef(0);
    const cleanupTimeoutRef = useRef<number | null>(null);
    const startYRef = useRef(0);

    const clampOffset = useCallback((value: number) => {
        if (value > SWIPE_MAX_PX) {
            return SWIPE_MAX_PX;
        }
        if (value < -SWIPE_MAX_PX) {
            return -SWIPE_MAX_PX;
        }
        return value;
    }, []);

    const resetAnimation = useCallback(() => {
        setIsAnimating(true);
        setOffset(0);
    }, []);

    useEffect(() => {
        return () => {
            if (cleanupTimeoutRef.current) {
                window.clearTimeout(cleanupTimeoutRef.current);
                cleanupTimeoutRef.current = null;
            }
        };
    }, []);

    const commitDelete = useCallback(
        (direction: number) => {
            if (!handlers?.onDelete || !urlId) {
                resetAnimation();
                return;
            }
            setIsAnimating(true);
            const commitOffset = clampOffset(direction * SWIPE_MAX_PX);
            setOffset(commitOffset);
            cleanupTimeoutRef.current = window.setTimeout(() => {
                handlers.onDelete?.(urlId);
                resetAnimation();
                cleanupTimeoutRef.current = null;
            }, SWIPE_COMMIT_DELAY);
        },
        [clampOffset, handlers, resetAnimation, urlId]
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (deleteDisabled) {
                return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }
            const target = event.target as HTMLElement;
            if (target.closest('button, a, input, textarea, select')) {
                return;
            }
            pointerIdRef.current = event.pointerId;
            startXRef.current = event.clientX;
            startYRef.current = event.clientY;
            setIsDragging(true);
            setIsAnimating(false);
            try {
                event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
                // ignore
            }
        },
        [deleteDisabled]
    );

    const finishGesture = useCallback(
        (event: React.PointerEvent<HTMLDivElement>, shouldCommit: boolean) => {
            if (!isDragging || pointerIdRef.current !== event.pointerId) {
                return;
            }
            try {
                event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
                // ignore
            }
            pointerIdRef.current = null;
            setIsDragging(false);
            if (shouldCommit) {
                const direction = offset >= 0 ? 1 : -1;
                commitDelete(direction);
                return;
            }
            resetAnimation();
        },
        [commitDelete, isDragging, offset, resetAnimation]
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (!isDragging || pointerIdRef.current !== event.pointerId) {
                return;
            }
            const deltaX = event.clientX - startXRef.current;
            const deltaY = event.clientY - startYRef.current;
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 6) {
                finishGesture(event, false);
                return;
            }
            setOffset(clampOffset(deltaX));
            event.preventDefault();
        },
        [clampOffset, finishGesture, isDragging]
    );

    const handlePointerUp = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const shouldCommit = Math.abs(offset) >= SWIPE_TRIGGER_PX;
            finishGesture(event, shouldCommit);
        },
        [finishGesture, offset]
    );

    const handlePointerCancel = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            finishGesture(event, false);
        },
        [finishGesture]
    );

    const leftProgress = offset > 0 ? Math.min(1, offset / SWIPE_TRIGGER_PX) : 0;
    const rightProgress = offset < 0 ? Math.min(1, -offset / SWIPE_TRIGGER_PX) : 0;
    const leftOpacity = leftProgress > 0 ? Math.min(1, 0.2 + leftProgress * 0.8) : 0;
    const rightOpacity = rightProgress > 0 ? Math.min(1, 0.2 + rightProgress * 0.8) : 0;

    const wrapperClass = useMemo(() => {
        const classes = ['history-card-wrapper'];
        if (isAnimating && !isDragging) {
            classes.push('history-card-wrapper--animate');
        }
        if (deleteDisabled) {
            classes.push('history-card-wrapper--disabled');
        }
        return classes.join(' ');
    }, [deleteDisabled, isAnimating, isDragging]);

    const activateTitle = useCallback(
        (event?: React.MouseEvent<HTMLAnchorElement> | React.KeyboardEvent<HTMLAnchorElement>) => {
            const url = item.url;
            if (!url) {
                return;
            }

            if (handlers?.onOpenBrowser) {
                event?.preventDefault?.();
                handlers.onOpenBrowser(url);
            }
        },
        [handlers, item.url]
    );

    const handleAnchorKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLAnchorElement>) => {
            if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                activateTitle(event);
            }
        },
        [activateTitle]
    );

    return (
        <div className="history-card-row" data-url-id={urlId}>
            <div className="history-card-swipe">
                <div className="history-card-swipe__action history-card-swipe__action--left" style={{ opacity: leftOpacity }}>
                    <span>삭제</span>
                </div>
                <div className="history-card-swipe__action history-card-swipe__action--right" style={{ opacity: rightOpacity }}>
                    <span>삭제</span>
                </div>
            </div>
            <div
                className={wrapperClass}
                style={{ transform: `translateX(${offset}px)` }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
            >
                <article className="history-card" data-status={status}>
                    <h2 className="history-card__title" title={title || '(제목 없음)'}>
                        {title ? (
                            item.url ? (
                                <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="history-card__title-link"
                                    onClick={activateTitle}
                                    onKeyDown={handleAnchorKeyDown}
                                >
                                    {title}
                                </a>
                            ) : (
                                title
                            )
                        ) : (
                            <span className="muted">(제목 없음)</span>
                        )}
                    </h2>
                    <div className="history-card__status-row">
                        <span className={statusClass}>{getStatusLabel(status)}</span>
                        <div className="history-card__progress">
                            <ProgressCell progress={progressValue} />
                        </div>
                    </div>
                    <dl className="history-card__meta" aria-label="다운로드 정보">
                        <div className="history-card__meta-item">
                            <dt>크기</dt>
                            <dd>
                                {fileSizeText ? (
                                    <span title={fileSizeTitle}>{fileSizeText}</span>
                                ) : (
                                    <span className="muted">-</span>
                                )}
                            </dd>
                        </div>
                        <div className="history-card__meta-item">
                            <dt>요청일</dt>
                            <dd>{createdAt}</dd>
                        </div>
                    </dl>
                    <div className="history-card__actions">
                        <ActionsCell
                            item={item}
                            urlId={urlId}
                            downloadTitle={downloadTitle}
                            downloadDisabled={downloadDisabled}
                            enableFormatSelection={enableFormatSelection}
                            {...handlers}
                            {...pendingState}
                        />
                    </div>
                </article>
            </div>
        </div>
    );
};

export const HistoryCardList: React.FC<HistoryCardListProps> = ({
    items,
    enableFormatSelection,
    handlers,
    pending
}) => {
    if (items.length === 0) {
        return (
            <div className="history-cards">
                <div className="history-card history-card--empty">
                    검색 결과가 없습니다.
                </div>
            </div>
        );
    }

    return (
        <div className="history-cards">
            {items.map((item, index) => {
                const urlId = item.urlId || '';
                const pendingState: ActionsCellState = {
                    isDownloadPending: Boolean(pending?.download?.[urlId]),
                    isStopPending: Boolean(pending?.stop?.[urlId]),
                    isResumePending: Boolean(pending?.resume?.[urlId]),
                    isRemovePending: Boolean(pending?.remove?.[urlId]),
                    isDeletePending: Boolean(pending?.delete?.[urlId]),
                    isFormatPending: Boolean(pending?.format?.[urlId])
                };

                return (
                    <HistoryCardRow
                        key={item.urlId ?? `card-${index}`}
                        item={item}
                        enableFormatSelection={enableFormatSelection}
                        handlers={handlers}
                        pendingState={pendingState}
                    />
                );
            })}
        </div>
    );
};
