import React from 'react';
import type { HistoryPageViewProps } from '../types';
import { HistoryTable } from './HistoryTable';
import { Pagination } from './Pagination';
import { SearchForm } from './SearchForm';
import { AddDownloadDialog } from './AddDownloadDialog';

export const HistoryAppShell: React.FC<HistoryPageViewProps> = ({
    items,
    total,
    page,
    pageSize,
    totalPages,
    showingFrom,
    showingTo,
    searchTerm,
    checkFormatList
}) => (
    <>
        <div className="card">
            <h1>다운로드 이력</h1>
            <div className="toolbar">
                <SearchForm searchTerm={searchTerm} />
                <div className="toolbar-actions">
                    <button type="button" className="secondary" data-action="refresh">
                        새로고침
                    </button>
                    <button type="button" className="primary" data-action="open-add-dialog">
                        다운로드 추가
                    </button>
                </div>
            </div>
            <HistoryTable items={items} enableFormatSelection={checkFormatList} />
            <div className="summary">
                <span>
                    총 {total.toLocaleString()}건 중 {showingFrom.toLocaleString()}-{showingTo.toLocaleString()} 표시
                </span>
                <Pagination page={page} totalPages={totalPages} pageSize={pageSize} searchTerm={searchTerm} />
            </div>
        </div>
        <AddDownloadDialog enableFormatSelection={checkFormatList} />
    </>
);
