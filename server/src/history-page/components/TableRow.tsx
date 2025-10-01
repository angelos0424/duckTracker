import React from 'react';
import type { HistoryItem } from '../types.js';
import { formatFileSize, getProgressFromItem } from '../utils/format.js';
import { ProgressCell } from './ProgressCell.js';
import { ActionsCell, type ActionsCellHandlers, type ActionsCellState } from './ActionsCell.js';

interface TableRowProps {
    item: HistoryItem;
    enableFormatSelection?: boolean;
    handlers?: ActionsCellHandlers;
    pendingState?: ActionsCellState;
}

export const TableRow: React.FC<TableRowProps> = ({ item, enableFormatSelection, handlers, pendingState }) => {
    const title = item.title?.trim() || '';
    const urlId = item.urlId || '';
    const status = item.status || 'unknown';
    const createdAt = item.createdAt || '-';
    const updatedAt = item.updatedAt || '-';
    const fileAvailable = Boolean(item.filePath);
    const sourceUrl = item.url || '';
    const urlDisplay = sourceUrl || urlId || '';
    const statusClass = `status-badge status-${status}`;
    const progressValue = getProgressFromItem(item);
    const downloadDisabled = !fileAvailable || status !== 'completed';
    const downloadTitle = downloadDisabled ? '완료된 항목만 다운로드할 수 있습니다.' : '파일 다운로드';
    const fileSizeText = formatFileSize(item.fileSizeBytes);
    const fileSizeTitle =
        fileSizeText && typeof item.fileSizeBytes === 'number'
            ? `${item.fileSizeBytes.toLocaleString()} bytes`
            : undefined;

    return (
        <tr data-url-id={urlId} data-status={status} data-source-url={sourceUrl} data-file-path={item.filePath || ''}>
            <td className="title" data-label="제목">
                <div className="title-text" title={title || '(제목 없음)'}>
                    {title ? title : <span className="muted">(제목 없음)</span>}
                </div>
                <div className="title-url" title={urlDisplay || '-'}>
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
            </td>
            <td className="status" data-label="상태">
                <span className={statusClass}>{status}</span>
            </td>
            <td className="progress" data-label="진행률">
                <ProgressCell progress={progressValue} />
            </td>
            <td className="size" data-label="크기">
                {fileSizeText ? <span title={fileSizeTitle}>{fileSizeText}</span> : <span className="muted">-</span>}
            </td>
            <td className="created" data-label="생성일">{createdAt}</td>
            <td className="updated" data-label="업데이트">{updatedAt}</td>
            <td className="actions" data-label="작업">
                <ActionsCell
                    item={item}
                    urlId={urlId}
                    downloadTitle={downloadTitle}
                    downloadDisabled={downloadDisabled}
                    enableFormatSelection={enableFormatSelection}
                    {...handlers}
                    {...pendingState}
                />
            </td>
        </tr>
    );
};
