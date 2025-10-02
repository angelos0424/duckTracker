import React from 'react';
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
                const status = item.status || 'unknown';
                const statusClass = `status-badge status-${status}`;
                const title = item.title?.trim() || '';
                const sourceUrl = item.url || '';
                const urlDisplay = sourceUrl || urlId || '';
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
                const pendingState: ActionsCellState = {
                    isDownloadPending: Boolean(pending?.download?.[urlId]),
                    isStopPending: Boolean(pending?.stop?.[urlId]),
                    isResumePending: Boolean(pending?.resume?.[urlId]),
                    isRemovePending: Boolean(pending?.remove?.[urlId]),
                    isDeletePending: Boolean(pending?.delete?.[urlId]),
                    isFormatPending: Boolean(pending?.format?.[urlId])
                };

                return (
                    <article
                        key={item.urlId ?? `card-${index}`}
                        className="history-card"
                        data-url-id={urlId}
                        data-status={status}
                    >
                        <header className="history-card__header">
                            <div className="history-card__title" title={title || '(제목 없음)'}>
                                <div className="history-card__title-text">
                                    {title ? title : <span className="muted">(제목 없음)</span>}
                                </div>
                                <div className="history-card__url" title={urlDisplay || '-'}>
                                    {sourceUrl ? (
                                        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                                            {urlDisplay}
                                        </a>
                                    ) : urlDisplay ? (
                                        urlDisplay
                                    ) : (
                                        <span className="muted">-</span>
                                    )}
                                </div>
                            </div>
                            <span className={statusClass}>{getStatusLabel(status)}</span>
                        </header>
                        <div className="history-card__progress">
                            <ProgressCell progress={progressValue} />
                        </div>
                        <dl className="history-card__meta">
                            <div>
                                <dt>크기</dt>
                                <dd>{fileSizeText ? <span title={fileSizeTitle}>{fileSizeText}</span> : <span className="muted">-</span>}</dd>
                            </div>
                            <div>
                                <dt>생성일</dt>
                                <dd>{item.createdAt || '-'}</dd>
                            </div>
                            <div>
                                <dt>업데이트</dt>
                                <dd>{item.updatedAt || '-'}</dd>
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
                );
            })}
        </div>
    );
};

