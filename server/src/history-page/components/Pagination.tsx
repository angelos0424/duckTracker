import React from 'react';
import type { PaginationState } from '../types.js';
import { buildPageLink } from '../utils/links.js';

export const Pagination: React.FC<PaginationState> = ({ page, totalPages, pageSize, searchTerm }) => {
    const baseParams = new URLSearchParams();
    if (searchTerm) {
        baseParams.set('search', searchTerm);
    }
    baseParams.set('pageSize', String(pageSize));

    const prevLink = page > 1 ? buildPageLink(baseParams, { page: page - 1 }) : null;
    const nextLink = page < totalPages ? buildPageLink(baseParams, { page: page + 1 }) : null;

    return (
        <div className="pagination">
            {prevLink ? (
                <a href={prevLink} aria-label="이전 페이지">
                    이전
                </a>
            ) : (
                <span className="disabled">이전</span>
            )}
            <span className="current">
                {page} / {totalPages}
            </span>
            {nextLink ? (
                <a href={nextLink} aria-label="다음 페이지">
                    다음
                </a>
            ) : (
                <span className="disabled">다음</span>
            )}
        </div>
    );
};
