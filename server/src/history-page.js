const { URLSearchParams } = require('node:url');

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPageLink(baseParams, overrides) {
  const params = new URLSearchParams(baseParams);
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      params.delete(key);
      return;
    }

    params.set(key, String(value));
  });
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

function renderTableRows(items) {
  if (!items || items.length === 0) {
    return `<tr class="empty-row"><td colspan="6">검색 결과가 없습니다.</td></tr>`;
  }

  return items
    .map((item) => {
      const title = escapeHtml(item.title || '');
      const urlId = escapeHtml(item.urlId || '');
      const status = escapeHtml(item.status || 'unknown');
      const lastError = escapeHtml(item.lastError || '');
      const createdAt = escapeHtml(item.createdAt || '');
      const updatedAt = escapeHtml(item.updatedAt || '');

      return `
        <tr>
          <td class="title">${title}</td>
          <td class="url-id">${urlId}</td>
          <td class="status">${status}</td>
          <td class="error">${lastError}</td>
          <td class="created">${createdAt}</td>
          <td class="updated">${updatedAt}</td>
        </tr>
      `;
    })
    .join('');
}

function renderHistoryPage({
  items,
  total,
  page,
  pageSize,
  searchTerm
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const baseParams = new URLSearchParams();
  if (searchTerm) {
    baseParams.set('search', searchTerm);
  }
  baseParams.set('pageSize', String(pageSize));

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  const prevLink = page > 1 ? buildPageLink(baseParams, { page: page - 1 }) : null;
  const nextLink = page < totalPages ? buildPageLink(baseParams, { page: page + 1 }) : null;

  const rows = renderTableRows(items);

  return `<!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>다운로드 이력</title>
    <style>
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
      form {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
        align-items: center;
      }
      label {
        font-weight: 600;
      }
      input[type="text"] {
        flex: 1;
        min-width: 240px;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid #d0d7de;
        font-size: 1rem;
      }
      button {
        padding: 10px 18px;
        border: none;
        border-radius: 10px;
        background: #2563eb;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      button:hover {
        background: #1d4ed8;
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
      .empty-row td {
        text-align: center;
        padding: 24px 12px;
        color: #6b7280;
        font-style: italic;
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
      @media (max-width: 768px) {
        table {
          display: block;
          overflow-x: auto;
        }
        th, td {
          white-space: nowrap;
        }
        .card {
          padding: 16px;
        }
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>다운로드 이력</h1>
      <form method="GET" action="/history">
        <label for="search">URL ID 또는 제목 검색</label>
        <input
          type="text"
          id="search"
          name="search"
          placeholder="검색어를 입력하세요"
          value="${escapeHtml(searchTerm || '')}"
        />
        <button type="submit">검색</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>제목</th>
            <th>URL ID</th>
            <th>상태</th>
            <th>오류</th>
            <th>생성일</th>
            <th>업데이트</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="summary">
        <span>총 ${total.toLocaleString()}건 중 ${showingFrom.toLocaleString()}-${showingTo.toLocaleString()} 표시</span>
        <div class="pagination">
          ${prevLink ? `<a href="${prevLink}" aria-label="이전 페이지">이전</a>` : '<span class="disabled">이전</span>'}
          <span class="current">${page} / ${totalPages}</span>
          ${nextLink ? `<a href="${nextLink}" aria-label="다음 페이지">다음</a>` : '<span class="disabled">다음</span>'}
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

module.exports = {
  renderHistoryPage
};
