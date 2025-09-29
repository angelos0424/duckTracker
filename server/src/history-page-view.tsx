import React from 'react';
import { URLSearchParams } from 'node:url';
import type { DownloadRecordRow } from './database';

const GLOBAL_STYLES = String.raw`
  :root {
    color-scheme: light dark;
    font-family: "Inter", "Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.5;
  }
  body {
    margin: 0;
    padding: 32px 24px 48px;
    background: #f7f7f8;
    color: #1f2328;
  }
  h1 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 1.75rem;
  }
  .card {
    max-width: 1200px;
    margin: 0 auto;
    background: white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    align-items: stretch;
    margin-bottom: 20px;
  }
  .search-form {
    display: flex;
    flex: 1;
    gap: 12px;
    min-width: 260px;
  }
  .search-form input[type="text"] {
    flex: 1;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid #d0d7de;
    font-size: 1rem;
  }
  .toolbar-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  button {
    padding: 10px 18px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    border: none;
  }
  button.primary {
    background: #2563eb;
    color: white;
  }
  button.primary:hover {
    background: #1d4ed8;
  }
  button.secondary {
    background: white;
    color: #1f2937;
    border: 1px solid #cbd5f5;
  }
  button.secondary:hover {
    background: #eff6ff;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    overflow: hidden;
    border-radius: 12px;
    background: #fdfdfd;
  }
  thead {
    background: #eff1f5;
  }
  th, td {
    padding: 12px 14px;
    text-align: left;
    vertical-align: top;
    font-size: 0.95rem;
  }
  tbody tr:nth-child(even) {
    background: rgba(37, 99, 235, 0.08);
  }
  tbody tr:hover {
    background: rgba(37, 99, 235, 0.15);
  }
  .actions-column {
    text-align: center;
    width: 120px;
  }
  .empty-row td {
    text-align: center;
    padding: 24px 12px;
    color: #6b7280;
    font-style: italic;
  }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: capitalize;
    background: #e2e8f0;
    color: #0f172a;
  }
  .status-completed {
    background: #dcfce7;
    color: #166534;
  }
  .status-downloading {
    background: #dbeafe;
    color: #1e3a8a;
  }
  .status-error, .status-failed {
    background: #fee2e2;
    color: #991b1b;
  }
  .status-queued, .status-pending {
    background: #fef3c7;
    color: #92400e;
  }
  .progress-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .progress-track {
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #2563eb;
    transition: width 0.2s ease;
  }
  .progress-value {
    min-width: 42px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #1f2937;
  }
  .icon-button {
    border: none;
    background: transparent;
    padding: 6px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
  }
  .icon-button svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
  .icon-button.download-button {
    color: #2563eb;
  }
  .icon-button.delete-button {
    color: #dc2626;
  }
  .icon-button:hover:not([disabled]) {
    background: rgba(37, 99, 235, 0.12);
    transform: translateY(-1px);
  }
  .icon-button[disabled] {
    color: #9ca3af;
    cursor: not-allowed;
    opacity: 0.7;
  }
  .title {
    width: clamp(260px, 40vw, 520px);
  }
  .title-text {
    font-weight: 600;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .title-url {
    font-size: 0.85rem;
    color: #64748b;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .title-url a {
    color: inherit;
    text-decoration: underline;
  }
  .muted {
    color: #94a3b8;
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin: 20px 0;
    color: #475569;
    font-size: 0.95rem;
  }
  .pagination {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .pagination a,
  .pagination span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 38px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid #d0d7de;
    text-decoration: none;
    color: inherit;
    font-weight: 600;
    background: white;
  }
  .pagination .current {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }
  .pagination .disabled {
    color: #94a3b8;
    cursor: not-allowed;
    background: #f8fafc;
  }
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  .dialog-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .dialog {
    background: #fff;
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 92%;
    box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
  }
  .dialog h2 {
    margin-top: 0;
    margin-bottom: 8px;
  }
  .dialog form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dialog input[type="url"] {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid #d1d5db;
    font-size: 1rem;
  }
  .dialog-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 8px;
  }
  .form-helper {
    color: #dc2626;
    font-size: 0.85rem;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 768px) {
    .card {
      padding: 16px;
    }
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    .toolbar-actions {
      justify-content: stretch;
    }
    .toolbar-actions button {
      flex: 1;
    }
    table, thead, tbody, th, tr, td {
      display: block;
    }
    thead {
      clip: rect(0 0 0 0);
      height: 1px;
      width: 1px;
      overflow: hidden;
      position: absolute;
    }
    tbody tr {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12);
      margin-bottom: 16px;
      padding: 16px;
    }
    td {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
    }
    td::before {
      content: attr(data-label);
      font-weight: 600;
      color: #475569;
    }
    .actions {
      justify-content: flex-start;
      gap: 12px;
    }
    .actions::before {
      align-self: center;
    }
    .title-text, .title-url {
      white-space: normal;
    }
    .summary {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }
  }
`;

const CLIENT_SCRIPT = String.raw`
  (function() {
    const backdrop = document.querySelector('[data-dialog="add-download"]');
    const form = backdrop ? backdrop.querySelector('form[data-form="add-download"]') : null;
    const urlInput = form ? form.querySelector('input[name="url"]') : null;
    const errorMessage = form ? form.querySelector('[data-error-message]') : null;

    function openDialog() {
      if (!backdrop) return;
      backdrop.hidden = false;
      requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        if (urlInput) {
          urlInput.value = '';
          urlInput.focus();
        }
        if (errorMessage) {
          errorMessage.hidden = true;
        }
      });
    }

    function closeDialog() {
      if (!backdrop) return;
      backdrop.classList.remove('visible');
      setTimeout(() => {
        backdrop.hidden = true;
      }, 150);
    }

    function validateUrl(value) {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch (error) {
        return false;
      }
    }

    function deriveUrlId(value) {
      try {
        const parsed = new URL(value);
        if (parsed.searchParams.has('list')) {
          return parsed.searchParams.get('list');
        }
        const pathname = parsed.pathname || '';
        const shortsMatch = pathname.match(/\\/shorts\\/([a-zA-Z0-9_-]{11})/u);
        if (shortsMatch && shortsMatch[1]) {
          return shortsMatch[1];
        }
        const watchId = parsed.searchParams.get('v');
        if (watchId) {
          return watchId;
        }
        if (parsed.hostname === 'youtu.be') {
          const [, id] = pathname.split('/');
          if (id) {
            return id;
          }
        }
        return parsed.href;
      } catch (error) {
        return '';
      }
    }

    const openButton = document.querySelector('[data-action="open-add-dialog"]');
    openButton?.addEventListener('click', openDialog);

    const refreshButton = document.querySelector('[data-action="refresh"]');
    refreshButton?.addEventListener('click', () => {
      window.location.reload();
    });

    backdrop?.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closeDialog();
      }
    });

    const cancelButton = backdrop ? backdrop.querySelector('[data-action="cancel-dialog"]') : null;
    cancelButton?.addEventListener('click', closeDialog);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!urlInput) return;
      const value = urlInput.value.trim();
      if (!validateUrl(value)) {
        if (errorMessage) {
          errorMessage.hidden = false;
        }
        urlInput.focus();
        return;
      }

      if (errorMessage) {
        errorMessage.hidden = true;
      }

      try {
        const response = await fetch('/history/request-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: value, urlId: deriveUrlId(value) })
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          alert(data.error || '다운로드 요청에 실패했습니다.');
          return;
        }

        closeDialog();
        window.location.reload();
      } catch (error) {
        alert('다운로드 요청 중 오류가 발생했습니다.');
      }
    });

    const escapeSelector = window.CSS?.escape
      ? (value) => window.CSS.escape(value)
      : (value) => String(value).replace(/[\\s#:;.]/g, '_');

    function updateRowState(row, state) {
      if (!row || !state) {
        return;
      }

      if (typeof state.title === 'string' && state.title.trim()) {
        const titleElement = row.querySelector('.title-text');
        if (titleElement) {
          titleElement.textContent = state.title.trim();
          titleElement.title = state.title.trim();
        }
      }

      if (typeof state.url === 'string' && state.url) {
        row.dataset.sourceUrl = state.url;
        const urlContainer = row.querySelector('.title-url');
        if (urlContainer) {
          const safeUrl = state.url;
          urlContainer.innerHTML = '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + safeUrl + '</a>';
          urlContainer.title = safeUrl;
        }
      }

      if (typeof state.status === 'string') {
        row.dataset.status = state.status;
        const badge = row.querySelector('.status .status-badge');
        if (badge) {
          const nextStatus = state.status.toLowerCase();
          badge.textContent = nextStatus;
          badge.className = 'status-badge status-' + nextStatus;
        }
      }

      if (Object.prototype.hasOwnProperty.call(state, 'error')) {
        const errorCell = row.querySelector('.error');
        if (errorCell) {
          const message = state.error ? String(state.error) : '';
          errorCell.innerHTML = message
            ? '<span title="' + message + '">' + message + '</span>'
            : '<span class="muted">-</span>';
        }
      }

      if (Object.prototype.hasOwnProperty.call(state, 'percent')) {
        const wrapper = row.querySelector('.progress .progress-wrapper');
        const fill = row.querySelector('.progress .progress-fill');
        const valueLabel = row.querySelector('.progress .progress-value');
        if (wrapper && fill && valueLabel) {
          const numeric = Number.isFinite(state.percent)
            ? Math.max(0, Math.min(100, state.percent))
            : 0;
          const rounded = Math.round(numeric);
          fill.style.width = String(rounded) + '%';
          wrapper.setAttribute('aria-valuenow', String(rounded));
          valueLabel.textContent = String(rounded) + '%';
        }
      }

      const stopButton = row.querySelector('.stop-button');
      const resumeButton = row.querySelector('.resume-button');
      const isActive = state.status === 'downloading' || state.status === 'queued';
      if (stopButton) {
        stopButton.disabled = !isActive;
      }
      if (resumeButton) {
        resumeButton.disabled = isActive;
      }
    }

    function handleDownloadState(state) {
      if (!state || !state.urlId) {
        return;
      }

      const row = document.querySelector('tr[data-url-id="' + escapeSelector(state.urlId) + '"]');
      if (!row) {
        return;
      }

      updateRowState(row, state);
    }

    function openWebSocket() {
      const body = document.body;
      const wsPath = body ? body.dataset.wsPath || '/' : '/';
      const normalisedPath = wsPath.startsWith('/') ? wsPath : '/' + wsPath;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + normalisedPath;

      let socket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (error) {
        console.error('웹소켓 연결 실패', error);
        return null;
      }

      socket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'download' && data.payload) {
            handleDownloadState(data.payload);
          } else if (data?.type === 'download-finished' && data.payload) {
            handleDownloadState({ ...data.payload, percent: 100 });
          }
        } catch (error) {
          console.error('웹소켓 메시지 파싱 실패', error);
        }
      });

      socket.addEventListener('close', () => {
        setTimeout(openWebSocket, 2000);
      });

      socket.addEventListener('error', () => {
        socket.close();
      });

      return socket;
    }

    openWebSocket();

    document.querySelectorAll('.delete-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const urlId = button.dataset.urlId;
        if (!urlId) return;
        const confirmed = window.confirm('정말로 이 다운로드 이력을 삭제하시겠습니까? 파일도 함께 삭제됩니다.');
        if (!confirmed) {
          return;
        }

        try {
          const response = await fetch('/history/' + encodeURIComponent(urlId), { method: 'DELETE' });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            alert(data.error || '삭제에 실패했습니다.');
            return;
          }
          window.location.reload();
        } catch (error) {
          alert('삭제 중 오류가 발생했습니다.');
        }
      });
    });

    document.querySelectorAll('.stop-button').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.disabled) {
          return;
        }
        const urlId = button.dataset.urlId;
        if (!urlId) return;

        button.disabled = true;
        try {
          const response = await fetch('/stop_download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urlId })
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            alert(data.error || '다운로드 정지에 실패했습니다.');
            button.disabled = false;
            return;
          }

          const state = await response.json().catch(() => null);
          if (state) {
            handleDownloadState(state);
          }
        } catch (error) {
          alert('다운로드 정지 중 오류가 발생했습니다.');
          button.disabled = false;
        }
      });
    });

    document.querySelectorAll('.resume-button').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.disabled) {
          return;
        }

        const urlId = button.dataset.urlId;
        if (!urlId) return;

        button.disabled = true;
        try {
          const response = await fetch('/restart_download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urlId })
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            alert(data.error || '다운로드 재시작에 실패했습니다.');
            button.disabled = false;
            return;
          }

          const state = await response.json().catch(() => null);
          if (state) {
            handleDownloadState(state);
          }
        } catch (error) {
          alert('다운로드 재시작 중 오류가 발생했습니다.');
          button.disabled = false;
        }
      });
    });

    document.querySelectorAll('.download-button').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) {
          return;
        }
        const urlId = button.dataset.urlId;
        if (!urlId) return;
        window.location.href = '/history/' + encodeURIComponent(urlId) + '/file';
      });
    });
  })();
`;

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

const ProgressCell: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="progress-wrapper" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${progress}%` }} />
    </div>
    <span className="progress-value">{progress}%</span>
  </div>
);

const ActionsCell: React.FC<{ item: DownloadRecordRow; downloadTitle: string; downloadDisabled: boolean; urlId: string }> = ({
  item,
  downloadTitle,
  downloadDisabled,
  urlId
}) => {
  const status = item.status || '';
  const isActive = status === 'downloading' || status === 'queued';
  const canDownload = !downloadDisabled;

  return (
    <>
      <button
        className="icon-button stop-button"
        data-url-id={urlId}
        title="다운로드 정지"
        aria-label="다운로드 정지"
        disabled={!isActive}
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
        disabled={isActive}
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
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 20h14v-2H5v2zm7-18l-5.5 6h3.5v6h4v-6H17L12 2z" />
        </svg>
      </button>
      <button className="icon-button delete-button" data-url-id={urlId} title="이력 삭제" aria-label="이력 삭제">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1z" />
        </svg>
      </button>
    </>
  );
};

const TableRow: React.FC<{ item: DownloadRecordRow }> = ({ item }) => {
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
  const progressValue = item.status === 'completed' ? 100 : 0;
  const downloadDisabled = !fileAvailable || status !== 'completed';
  const downloadTitle = downloadDisabled ? '완료된 항목만 다운로드할 수 있습니다.' : '파일 다운로드';

  return (
    <tr data-url-id={urlId} data-status={status} data-source-url={sourceUrl}>
      <td className="title" data-label="제목 / URL ID">
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

const HistoryTable: React.FC<{ items: DownloadRecordRow[] }> = ({ items }) => (
  <table role="grid">
    <thead>
      <tr>
        <th>제목 / URL ID</th>
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

export interface HistoryPageProps {
  items: DownloadRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  showingFrom: number;
  showingTo: number;
  searchTerm?: string;
  wsPath: string;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  items,
  total,
  page,
  pageSize,
  totalPages,
  showingFrom,
  showingTo,
  searchTerm,
  wsPath
}) => (
  <html lang="ko">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>다운로드 이력</title>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
    </head>
    <body data-ws-path={wsPath || '/'}>
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
      <script dangerouslySetInnerHTML={{ __html: CLIENT_SCRIPT }} />
    </body>
  </html>
);
