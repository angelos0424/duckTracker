import React from 'react';
import { URLSearchParams } from 'node:url';
import type { DownloadRecordRow } from './database';

function buildPageLink(baseParams: URLSearchParams, overrides: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams(baseParams);
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  });
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

function formatProgress(value: unknown): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value as number)));
}

function getProgressFromItem(item: DownloadRecordRow & { percent?: number | null }): number {
  if (Number.isFinite(item.percent)) {
    return formatProgress(item.percent as number);
  }
  return item.status === 'completed' ? 100 : 0;
}

const ProgressCell: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="progress-wrapper" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${progress}%` }} />
    </div>
    <span className="progress-value">{progress}%</span>
  </div>
);

interface ActionsCellProps {
  item: DownloadRecordRow;
  downloadTitle: string;
  downloadDisabled: boolean;
  urlId: string;
  isDownloadPending?: boolean;
  isStopPending?: boolean;
  isResumePending?: boolean;
  isRemovePending?: boolean;
  isDeletePending?: boolean;
}

const ActionsCell: React.FC<ActionsCellProps> = ({
  item,
  downloadTitle,
  downloadDisabled,
  urlId,
  isDownloadPending,
  isStopPending,
  isResumePending,
  isRemovePending,
  isDeletePending
}) => {
  const status = item.status || '';
  const isActive = status === 'downloading' || status === 'queued';
  const fileExists = Boolean(item.filePath);
  const downloadBusy = Boolean(isDownloadPending);
  const stopBusy = Boolean(isStopPending);
  const resumeBusy = Boolean(isResumePending);
  const removeBusy = Boolean(isRemovePending);
  const deleteBusy = Boolean(isDeletePending);
  const canDownload = !downloadDisabled && !downloadBusy;

  return (
    <>
      <button
        className="icon-button stop-button"
        data-url-id={urlId}
        title="다운로드 정지"
        aria-label="다운로드 정지"
        disabled={!isActive || stopBusy}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5h3v14H8zm5 0h3v14h-3z" />
        </svg>
      </button>
      <button
        className="icon-button resume-button"
        data-url-id={urlId}
        title="다운로드 재시작"
        aria-label="다운로드 재시작"
        disabled={isActive || resumeBusy}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
      <button
        className="icon-button download-button"
        data-url-id={urlId}
        title={downloadTitle}
        aria-label={downloadTitle}
        disabled={!canDownload}
        data-loading={downloadBusy ? 'true' : undefined}
        aria-busy={downloadBusy ? 'true' : undefined}
      >
        <span className="spinner" aria-hidden="true" />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 20h14v-2H5v2zm7-18l-5.5 6h3.5v6h4v-6H17L12 2z" />
        </svg>
      </button>
      <button
        className="icon-button remove-file-button"
        data-url-id={urlId}
        title={fileExists ? '파일만 삭제' : '삭제할 파일이 없습니다.'}
        aria-label="파일 삭제"
        disabled={!fileExists || removeBusy}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1z" />
          <path d="M10 11h1.5v6H10zm2.5 0H14v6h-1.5z" />
        </svg>
      </button>
      <button
        className="icon-button delete-button"
        data-url-id={urlId}
        title="이력 삭제"
        aria-label="이력 삭제"
        disabled={deleteBusy}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1z" />
        </svg>
      </button>
    </>
  );
};

const TableRow: React.FC<{ item: DownloadRecordRow & { percent?: number | null } }> = ({ item }) => {
  const title = item.title?.trim() || '';
  const urlId = item.urlId || '';
  const status = item.status || 'unknown';
  const lastError = item.lastError || '';
  const createdAt = item.createdAt || '-';
  const updatedAt = item.updatedAt || '-';
  const fileAvailable = Boolean(item.filePath);
  const sourceUrl = item.url || '';
  const urlDisplay = sourceUrl || urlId || '';
  const statusClass = `status-badge status-${status}`;
  const progressValue = getProgressFromItem(item);
  const downloadDisabled = !fileAvailable || status !== 'completed';
  const downloadTitle = downloadDisabled ? '완료된 항목만 다운로드할 수 있습니다.' : '파일 다운로드';

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
      <td className="error" data-label="오류">
        {lastError ? <span title={lastError}>{lastError}</span> : <span className="muted">-</span>}
      </td>
      <td className="created" data-label="생성일">{createdAt}</td>
      <td className="updated" data-label="업데이트">{updatedAt}</td>
      <td className="actions" data-label="작업">
        <ActionsCell
          item={item}
          urlId={urlId}
          downloadTitle={downloadTitle}
          downloadDisabled={downloadDisabled}
        />
      </td>
    </tr>
  );
};

const HistoryTable: React.FC<{ items: (DownloadRecordRow & { percent?: number | null })[] }> = ({ items }) => (
  <table role="grid">
    <thead>
      <tr>
        <th>제목</th>
        <th>상태</th>
        <th>진행률</th>
        <th>오류</th>
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
        items.map((item, index) => <TableRow key={item.urlId ?? `row-${index}`} item={item} />)
      )}
    </tbody>
  </table>
);

interface PaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  searchTerm?: string;
}

const Pagination: React.FC<PaginationProps> = ({ page, totalPages, pageSize, searchTerm }) => {
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

const SearchForm: React.FC<{ searchTerm?: string }> = ({ searchTerm }) => (
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

const HistoryAppShell: React.FC<HistoryPageProps> = ({
  items,
  total,
  page,
  pageSize,
  totalPages,
  showingFrom,
  showingTo,
  searchTerm
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
      <HistoryTable items={items} />
      <div className="summary">
        <span>
          총 {total.toLocaleString()}건 중 {showingFrom.toLocaleString()}-{showingTo.toLocaleString()} 표시
        </span>
        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} searchTerm={searchTerm} />
      </div>
    </div>
    <AddDownloadDialog />
  </>
);

const AddDownloadDialog: React.FC = () => (
  <div className="dialog-backdrop" data-dialog="add-download" hidden>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-download-title">
      <h2 id="add-download-title">다운로드 추가</h2>
      <p>다운로드할 영상의 URL을 입력하세요.</p>
      <form data-form="add-download">
        <label htmlFor="download-url" className="visually-hidden">
          다운로드 URL
        </label>
        <input type="url" id="download-url" name="url" placeholder="https://" required />
        <p className="form-helper" data-error-message hidden>
          유효한 URL을 입력해주세요.
        </p>
        <div className="dialog-buttons">
          <button type="button" className="secondary" data-action="cancel-dialog">
            취소
          </button>
          <button type="submit" className="primary">
            다운로드 요청
          </button>
        </div>
      </form>
    </div>
  </div>
);

export interface HistoryPageProps {
  items: (DownloadRecordRow & { percent?: number | null })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  showingFrom: number;
  showingTo: number;
  searchTerm?: string;
  wsPath: string;
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003C');
}

export const HistoryPage: React.FC<HistoryPageProps> = (props) => (
  <html lang="ko">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>다운로드 이력</title>
      <link rel="stylesheet" href="/history/assets/history-page.css" />
    </head>
    <body data-ws-path={props.wsPath || '/'}>
      <div id="history-root">
        <HistoryAppShell {...props} />
      </div>
      <script
        id="history-props"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: escapeJsonForScript(props) }}
      />
      <script src="/history/assets/react.production.min.js"></script>
      <script src="/history/assets/react-dom.production.min.js"></script>
      <script src="/history/assets/history-client.js"></script>
    </body>
  </html>
);
