import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DownloadRecordRow } from './database';
import { HistoryPage, type HistoryPageProps } from './history-page-view';

export interface RenderHistoryPageOptions {
  items: DownloadRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  searchTerm?: string;
  wsPath?: string;
  checkFormatList: boolean;
}

function normaliseWsPath(path?: string): string {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function buildHistoryPageProps({
  items,
  total,
  page,
  pageSize,
  searchTerm,
  wsPath,
  checkFormatList
}: RenderHistoryPageOptions): HistoryPageProps {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * safePageSize + 1;
  const showingTo = Math.min(page * safePageSize, total);

  return {
    items,
    total,
    page,
    pageSize: safePageSize,
    totalPages,
    showingFrom,
    showingTo,
    searchTerm,
    wsPath: normaliseWsPath(wsPath),
    checkFormatList
  };
}

export function renderHistoryPage(options: RenderHistoryPageOptions): ReactElement {
  const props = buildHistoryPageProps(options);
  return createElement(HistoryPage, props);
}

export function renderHistoryPageToHtml(options: RenderHistoryPageOptions): string {
  const element = renderHistoryPage(options);
  return '<!DOCTYPE html>' + renderToStaticMarkup(element);
}

export type { HistoryPageProps } from './history-page-view';
