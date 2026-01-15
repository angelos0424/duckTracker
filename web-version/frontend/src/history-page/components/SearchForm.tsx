import React from 'react';

interface SearchFormProps {
    searchTerm?: string;
    pageSize?: number;
    selectedStatuses?: readonly string[];
}

export const SearchForm: React.FC<SearchFormProps> = ({ searchTerm, pageSize, selectedStatuses }) => (
    <form method="GET" action="/" className="search-form">
        <label htmlFor="history-search" className="visually-hidden">
            URL ID 또는 제목 검색
        </label>
        <div className="search-form__field">
            <span className="search-form__icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" focusable="false">
                    <path
                        d="M8.5 2a6.5 6.5 0 0 1 5.148 10.5l3.176 3.177a1 1 0 0 1-1.414 1.414l-3.177-3.176A6.5 6.5 0 1 1 8.5 2zm0 2a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9z"
                    />
                </svg>
            </span>
            <input
                type="text"
                id="history-search"
                name="search"
                placeholder="URL ID 또는 제목 검색"
                defaultValue={searchTerm ?? ''}
                aria-label="URL ID 또는 제목 검색"
                className="search-form__input"
            />
        </div>
        <button type="submit" className="search-form__submit">
            검색
        </button>
        {Number.isFinite(pageSize) && pageSize ? (
            <input type="hidden" name="pageSize" value={String(pageSize)} />
        ) : null}
        {selectedStatuses && selectedStatuses.length > 0
            ? Array.from(new Set(selectedStatuses)).map((status) => (
                  <input key={status} type="hidden" name="status" value={status} />
              ))
            : null}
    </form>
);
