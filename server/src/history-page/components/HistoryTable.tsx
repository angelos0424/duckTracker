import React from 'react';
import type { HistoryItem } from '../types';
import type { ActionsCellHandlers, ActionsCellState } from './ActionsCell';
import { TableRow } from './TableRow';

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
}

export const HistoryTable: React.FC<HistoryTableProps> = ({ items, enableFormatSelection, handlers, pending }) => (
    <table role="grid">
        <thead>
            <tr>
                <th>제목</th>
                <th>상태</th>
                <th>진행률</th>
                <th>크기</th>
                <th>생성일</th>
                <th>업데이트</th>
                <th className="actions-column">작업</th>
            </tr>
        </thead>
        <tbody>
            {items.length === 0 ? (
                <tr className="empty-row">
                    <td colSpan={7}>검색 결과가 없습니다.</td>
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
