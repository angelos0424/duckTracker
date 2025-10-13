import React from 'react';
import type { HistoryItem } from '../types.js';
import type { ActionsCellHandlers, ActionsCellState } from './ActionsCell.js';
import { TableRow } from './TableRow.js';

export type HistoryTableSortColumn =
    | 'title'
    | 'status'
    | 'percent'
    | 'fileSizeBytes'
    | 'createdAt'
    | 'updatedAt';

export type HistoryTableSortDirection = 'asc' | 'desc';

export interface HistoryTableSortState {
    column: HistoryTableSortColumn;
    direction: HistoryTableSortDirection;
}

interface PendingMaps {
    download?: Record<string, boolean>;
    stop?: Record<string, boolean>;
    resume?: Record<string, boolean>;
    remove?: Record<string, boolean>;
    delete?: Record<string, boolean>;
    format?: Record<string, boolean>;
}

interface HistoryTableProps {
    items: HistoryItem[];
    enableFormatSelection?: boolean;
    handlers?: ActionsCellHandlers;
    pending?: PendingMaps;
    sortState?: HistoryTableSortState | null;
    onRequestSort?: (column: HistoryTableSortColumn, direction: HistoryTableSortDirection) => void;
}

const COLUMN_LABELS: Record<HistoryTableSortColumn, string> = {
    title: '제목',
    status: '상태',
    percent: '진행률',
    fileSizeBytes: '크기',
    createdAt: '생성일',
    updatedAt: '업데이트'
};

interface HeaderConfig {
    key: HistoryTableSortColumn | 'actions';
    label: string;
    className?: string;
    sortable?: boolean;
}

const HEADERS: HeaderConfig[] = [
    { key: 'title', label: COLUMN_LABELS.title, sortable: true },
    { key: 'status', label: COLUMN_LABELS.status, sortable: true },
    { key: 'percent', label: COLUMN_LABELS.percent, sortable: true },
    { key: 'fileSizeBytes', label: COLUMN_LABELS.fileSizeBytes, sortable: true },
    { key: 'createdAt', label: COLUMN_LABELS.createdAt, sortable: true },
    { key: 'updatedAt', label: COLUMN_LABELS.updatedAt, sortable: true },
    { key: 'actions', label: '작업', className: 'actions-column' }
];

const SortButtons: React.FC<{
    column: HistoryTableSortColumn;
    activeDirection: HistoryTableSortDirection | null;
    onRequestSort?: (column: HistoryTableSortColumn, direction: HistoryTableSortDirection) => void;
}> = ({ column, activeDirection, onRequestSort }) => (
    <span className="history-table__sort" role="group" aria-label={`${COLUMN_LABELS[column]} 정렬 옵션`}>
        <button
            type="button"
            className={`sort-triangle sort-triangle--up${activeDirection === 'asc' ? ' sort-triangle--active' : ''}`}
            onClick={() => onRequestSort?.(column, 'asc')}
            aria-label={`${COLUMN_LABELS[column]} 오름차순 정렬`}
            title={`${COLUMN_LABELS[column]} 오름차순 정렬`}
            aria-pressed={activeDirection === 'asc'}
        >
            <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
                <path d="M6 3L10 9H2L6 3Z" />
            </svg>
        </button>
        <button
            type="button"
            className={`sort-triangle sort-triangle--down${activeDirection === 'desc' ? ' sort-triangle--active' : ''}`}
            onClick={() => onRequestSort?.(column, 'desc')}
            aria-label={`${COLUMN_LABELS[column]} 내림차순 정렬`}
            title={`${COLUMN_LABELS[column]} 내림차순 정렬`}
            aria-pressed={activeDirection === 'desc'}
        >
            <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
                <path d="M6 9L2 3H10L6 9Z" />
            </svg>
        </button>
    </span>
);

export const HistoryTable: React.FC<HistoryTableProps> = ({
    items,
    enableFormatSelection,
    handlers,
    pending,
    sortState,
    onRequestSort
}) => (
    <table className="history-table" role="grid">
        <thead>
            <tr>
                {HEADERS.map((header) => {
                    const isSortable = Boolean(header.sortable);
                    const activeDirection =
                        isSortable && sortState && sortState.column === header.key
                            ? sortState.direction
                            : null;
                    const ariaSortValue = !isSortable
                        ? undefined
                        : activeDirection === 'asc'
                        ? 'ascending'
                        : activeDirection === 'desc'
                        ? 'descending'
                        : 'none';

                    return (
                        <th
                            key={header.key}
                            scope="col"
                            className={header.className}
                            aria-sort={ariaSortValue}
                        >
                            <div className="history-table__header-cell">
                                <span>{header.label}</span>
                                {isSortable ? (
                                    <SortButtons
                                        column={header.key as HistoryTableSortColumn}
                                        activeDirection={activeDirection}
                                        onRequestSort={onRequestSort}
                                    />
                                ) : null}
                            </div>
                        </th>
                    );
                })}
            </tr>
        </thead>
        <tbody>
            {items.length === 0 ? (
                <tr className="empty-row">
                    <td colSpan={HEADERS.length}>검색 결과가 없습니다.</td>
                </tr>
            ) : (
                items.map((item, index) => {
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
                        <TableRow
                            key={item.urlId ?? `row-${index}`}
                            item={item}
                            enableFormatSelection={enableFormatSelection}
                            handlers={handlers}
                            pendingState={pendingState}
                        />
                    );
                })
            )}
        </tbody>
    </table>
);
