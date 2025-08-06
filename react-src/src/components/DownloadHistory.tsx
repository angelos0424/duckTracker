import React, { useState, useMemo, useCallback } from 'react';
import ConfirmationDialog from './ConfirmationDialog';
import UrlInputDialog from './UrlInputDialog';
import {formatBytes, formatDuration, formatDate, extractUrlId} from '../shared/utils';
import { DownloadRecord } from '../types/types';

interface DownloadHistoryProps {
  downloads: DownloadRecord[];
  onRefresh: () => void;
  onDelete: (ids: string[]) => void;
  onOpenFile: (filePath: string) => void;
  onRetry: (url:string, urlId: string) => void;
  onAddDownload: (url: string, urlId: string) => Promise<void>;
  onStopDownload: (id: string) => Promise<void>;
  onOpenExternalUrl: (url: string) => Promise<void>;
  getUrlFromClipboard: () => Promise<string>;
}

type SortKey = keyof DownloadRecord | 'none';
type SortDirection = 'asc' | 'desc';

const DownloadHistory: React.FC<DownloadHistoryProps> = ({
  downloads,
  onRefresh,
  onDelete,
  onOpenFile,
  onRetry,
  onAddDownload,
  onStopDownload,
  onOpenExternalUrl,
  getUrlFromClipboard,
}) => {
  const [selectedDownloads, setSelectedDownloads] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUrlInputDialog, setShowUrlInputDialog] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'start_time',
    direction: 'desc',
  });

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedDownloads(downloads.map((d) => d.url_id));
    } else {
      setSelectedDownloads([]);
    }
  };

  const handleSelectDownload = (event: React.ChangeEvent<HTMLInputElement>, id: string) => {
    if (event.target.checked) {
      setSelectedDownloads((prev) => [...prev, id]);
    } else {
      setSelectedDownloads((prev) => prev.filter((selectedId) => selectedId !== id));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedDownloads.length > 0) {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = () => {
    onDelete(selectedDownloads);
    setSelectedDownloads([]);
    setShowDeleteConfirm(false);
  };

  const handleAddDownloadClick = () => {
    setShowUrlInputDialog(true);
  };

  const handleAddDownloadConfirm = async (url: string) => {
    try {
      const urlInfo = extractUrlId(url)
      console.log('handleAddDownloadConfirm called: ', urlInfo, url);
      await onAddDownload(url, urlInfo.urlId);
      setShowUrlInputDialog(false);
      console.log('handleAddDownloadConfirm end: ', urlInfo, url);
    } catch (error) {
      console.error('Failed to add download:', error);
      // Optionally show an error message to the user
    }
  };

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedDownloads = useMemo(() => {
    if (sortConfig.key === 'none') {
      return downloads;
    }

    return [...downloads].sort((a, b) => {
      const key = sortConfig.key as keyof DownloadRecord;
      const aValue = a[key];
      const bValue = b[key];

      if (aValue === undefined || aValue === null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue === undefined || bValue === null) return sortConfig.direction === 'asc' ? -1 : 1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      // Fallback for other types or mixed types
      return 0;
    });
  }, [downloads, sortConfig]);

  const getSortIcon = (key: SortKey) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? '▲' : '▼';
    }
    return '';
  };

  const getStatusBadge = useCallback((status: DownloadRecord['status'], error_message?: string) => {
    let className = 'status-badge';
    let icon = '';
    switch (status) {
      case 'pending':
        className += ' status-pending';
        icon = '⏳';
        break;
      case 'downloading':
        className += ' status-downloading';
        icon = '⬇️';
        break;
      case 'completed':
        className += ' status-completed';
        icon = '✅';
        break;
      case 'failed':
        className += ' status-failed';
        icon = '❌';
        break;
      case 'cancelled':
        className += ' status-cancelled';
        icon = '🚫';
        break;
      default:
        break;
    }
    return (
      <div className={className}>
        <span className="status-icon">{icon}</span>
        <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
        {error_message && <div className="error-message" title={error_message}>{error_message}</div>}
      </div>
    );
  }, []);

  return (
    <div className="download-history">
      <div className="download-history-header">
        <div className="header-left">
          <h2>Download History</h2>
          <span className="download-count">({downloads.length} items)</span>
        </div>
        <div className="header-actions">
          <button className="add-download-button" onClick={handleAddDownloadClick}>
            + Add Download
          </button>
          <button className="refresh-button" onClick={onRefresh}>
            Refresh
          </button>
          <button
            className="delete-selected-button"
            onClick={handleDeleteSelected}
            disabled={selectedDownloads.length === 0}
          >
            Delete Selected ({selectedDownloads.length})
          </button>
        </div>
      </div>

      {downloads.length === 0 ? (
        <div className="no-downloads">
          <span className="no-downloads-icon">✨</span>
          <p>No downloads yet!</p>
          <p className="no-downloads-subtitle">Start by adding a new download.</p>
        </div>
      ) : (
        <div className="download-table-container">
          <table className="download-table">
            <thead>
              <tr>
                <th className="checkbox-column">
                  <input
                    type="checkbox"
                    className="select-all-checkbox"
                    onChange={handleSelectAll}
                    checked={selectedDownloads.length === downloads.length && downloads.length > 0}
                  />
                </th>
                <th className="sortable-header" onClick={() => handleSort('title')}>
                  Title {getSortIcon('title')}
                </th>
                <th className="sortable-header" onClick={() => handleSort('status')}>
                  Status {getSortIcon('status')}
                </th>
                <th className="sortable-header" onClick={() => handleSort('progress')}>
                  Progress {getSortIcon('progress')}
                </th>
                <th className="sortable-header" onClick={() => handleSort('file_size')}>
                  Size {getSortIcon('file_size')}
                </th>
                <th className="sortable-header" onClick={() => handleSort('duration')}>
                  Duration {getSortIcon('duration')}
                </th>
                <th className="sortable-header" onClick={() => handleSort('start_time')}>
                  Date {getSortIcon('start_time')}
                </th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedDownloads.map((download) => (
                <tr key={download.id} className={selectedDownloads.includes(download.url_id) ? 'selected' : ''}>
                  <td className="checkbox-column">
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={selectedDownloads.includes(download.url_id)}
                      onChange={(e) => handleSelectDownload(e, download.url_id)}
                    />
                  </td>
                  <td className="title-column">
                    <div className="title-content">
                      <span className="download-title" title={download.title}>{download.title}</span>
                      <a
                        href={download.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="download-url"
                        title={download.url}
                        onClick={(e) => {
                          e.preventDefault();
                          onOpenExternalUrl(download.url);
                        }}
                      >
                        {download.url}
                      </a>
                    </div>
                  </td>
                  <td className="status-column">
                    {getStatusBadge(download.status, download.error_message)}
                  </td>
                  <td className="progress-column">
                    {download.status === 'downloading' || download.status === 'completed' ? (
                      <div className="progress-container">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${download.progress || 0}%` }}
                          ></div>
                        </div>
                        <span className="progress-text">{download.progress?.toFixed(1) || 0}%</span>
                      </div>
                    ) : (
                      <span className="progress-text">N/A</span>
                    )}
                  </td>
                  <td className="size-column">
                    {download.file_size ? formatBytes(download.file_size) : 'N/A'}
                  </td>
                  <td className="duration-column">
                    {download.duration ? formatDuration(download.duration) : 'N/A'}
                  </td>
                  <td className="date-column">
                    {download.start_time || 'N/A'}
                  </td>
                  <td className="actions-column">
                    <div className="action-buttons">
                      {download.status === 'completed' && download.file_path && (
                        <button
                          className="action-button open-file-button"
                          onClick={() => onOpenFile(download.file_path!)}
                          title="Open File Location"
                        >
                          📁
                        </button>
                      )}
                      {(download.status === 'failed' || download.status === 'cancelled') && (
                        <button
                          className="action-button retry-button"
                          onClick={() => onRetry(download.url, download.url_id)}
                          title="Retry Download"
                        >
                          🔄
                        </button>
                      )}
                      {download.status === 'downloading' && (
                        <button
                          className="action-button stop-button"
                          onClick={() => onStopDownload(download.url_id)}
                          title="Stop Download"
                        >
                          ⏹️
                        </button>
                      )}
                      <button
                        className="action-button delete-button"
                        onClick={() => onDelete([download.url_id])}
                        title="Delete Download"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Confirm Deletion"
        message={`Are you sure you want to delete ${selectedDownloads.length} selected download(s)? This action cannot be undone.`}
        confirmButtonText="Delete"
        confirmButtonColor="danger"
        icon="⚠️"
      />

      <UrlInputDialog
        isOpen={showUrlInputDialog}
        onClose={() => setShowUrlInputDialog(false)}
        onConfirm={handleAddDownloadConfirm}
        getUrlFromClipboard={getUrlFromClipboard}
      />
    </div>
  );
};

export default DownloadHistory;
