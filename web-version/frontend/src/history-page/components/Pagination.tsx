import React from 'react';
import type { PaginationState } from '../types.js';
import { buildPageLink } from '../utils/links.js';

const DEFAULT_PAGE_WINDOW_SIZE = 10;
const MOBILE_LARGE_WINDOW_SIZE = 5;
const MOBILE_SMALL_WINDOW_SIZE = 4;
const MOBILE_BREAKPOINT = 768;
const SMALL_MOBILE_BREAKPOINT = 480;

const getWindowSizedPageWindow = (width: number): number => {
    if (width < SMALL_MOBILE_BREAKPOINT) {
        return MOBILE_SMALL_WINDOW_SIZE;
    }

    if (width < MOBILE_BREAKPOINT) {
        return MOBILE_LARGE_WINDOW_SIZE;
    }

    return DEFAULT_PAGE_WINDOW_SIZE;
};

export const Pagination: React.FC<PaginationState> = ({
    page,
    totalPages,
    pageSize,
    searchTerm,
    selectedStatuses
}) => {
    const [pageWindowSize, setPageWindowSize] = React.useState<number>(() => {
        if (typeof window === 'undefined') {
            return DEFAULT_PAGE_WINDOW_SIZE;
        }

        return getWindowSizedPageWindow(window.innerWidth);
    });

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleResize = () => {
            const nextWindowSize = getWindowSizedPageWindow(window.innerWidth);
            setPageWindowSize((currentWindowSize) => (
                currentWindowSize === nextWindowSize ? currentWindowSize : nextWindowSize
            ));
        };

        handleResize();

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const baseParams = new URLSearchParams();
    if (searchTerm) {
        baseParams.set('search', searchTerm);
    }
    baseParams.set('pageSize', String(pageSize));
    if (selectedStatuses && selectedStatuses.length > 0) {
        Array.from(new Set(selectedStatuses)).forEach((status) => {
            baseParams.append('status', status);
        });
    }

    const prevLink = page > 1 ? buildPageLink(baseParams, { page: page - 1 }) : null;
    const nextLink = page < totalPages ? buildPageLink(baseParams, { page: page + 1 }) : null;

    const startPage = Math.floor((page - 1) / pageWindowSize) * pageWindowSize + 1;
    const endPage = Math.min(startPage + pageWindowSize - 1, totalPages);
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
