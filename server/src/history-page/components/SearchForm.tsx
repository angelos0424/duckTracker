import React from 'react';

interface SearchFormProps {
    searchTerm?: string;
}

export const SearchForm: React.FC<SearchFormProps> = ({ searchTerm }) => (
    <form method="GET" action="/history" className="search-form">
        <label htmlFor="search" className="visually-hidden">
            URL ID 또는 제목 검색
        </label>
        <input
            type="text"
            id="search"
            name="search"
            placeholder="URL ID 또는 제목 검색"
            defaultValue={searchTerm ?? ''}
            aria-label="URL ID 또는 제목 검색"
        />
        <button type="submit" className="primary">
            검색
        </button>
    </form>
);
