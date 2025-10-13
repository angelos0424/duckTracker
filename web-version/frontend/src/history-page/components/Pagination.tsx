import React from 'react';
import type { PaginationState } from '../types.js';
import { buildPageLink } from '../utils/links.js';

const PAGE_WINDOW_SIZE = 10;

export const Pagination: React.FC<PaginationState> = ({ page, totalPages, pageSize, searchTerm }) => {
    const baseParams = new URLSearchParams();
    if (searchTerm) {
        baseParams.set('search', searchTerm);
    }
    baseParams.set('pageSize', String(pageSize));

    const prevLink = page > 10 ? buildPageLink(baseParams, { page: page - 10 }) : null;
    const nextLink = page < totalPages -10 ? buildPageLink(baseParams, { page: page + 10 }) : null;

    const startPage = Math.floor((page - 1) / PAGE_WINDOW_SIZE) * PAGE_WINDOW_SIZE + 1;
    const endPage = Math.min(startPage + PAGE_WINDOW_SIZE - 1, totalPages);
    const pageNumbers = Array.from({ length: Math.max(0, endPage - startPage + 1) }, (_, index) => startPage + index);

    return (
        <div className="pagination">
            <div className="pagination__nav pagination__nav--prev">
                {prevLink ? (
                    <a href={prevLink} aria-label="이전 페이지">
                        이전
                    </a>
                ) : (
                    <span className="disabled">이전</span>
                )}
            </div>
            <div className="pagination__pages" aria-label="페이지 선택">
                {pageNumbers.map((pageNumber) => {
                    if (pageNumber === page) {
                        return (
                            <span key={pageNumber} className="current" aria-current="page">
                                {pageNumber}
                            </span>
                        );
                    }

                    const pageLink = buildPageLink(baseParams, { page: pageNumber });
                    return (
                        <a key={pageNumber} href={pageLink} aria-label={`${pageNumber} 페이지로 이동`}>
                            {pageNumber}
                        </a>
                    );
                })}
            </div>
            <div className="pagination__nav pagination__nav--next">
                {nextLink ? (
                    <a href={nextLink} aria-label="다음 페이지">
                        다음
                    </a>
                ) : (
                    <span className="disabled">다음</span>
                )}
            </div>
        </div>
    );
};
