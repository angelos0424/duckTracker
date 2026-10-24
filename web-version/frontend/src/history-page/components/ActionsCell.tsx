import React from 'react';
import type { HistoryItem } from '../types.js';

export interface ActionsCellState {
    isDownloadPending?: boolean;
    isStopPending?: boolean;
    isResumePending?: boolean;
    isRemovePending?: boolean;
    isDeletePending?: boolean;
    isFormatPending?: boolean;
}

export interface ActionsCellHandlers {
    onDownload?: (urlId: string) => void;
    onStop?: (urlId: string) => void;
    onResume?: (urlId: string) => void;
    onRemoveFile?: (urlId: string) => void;
    onDelete?: (urlId: string) => void;
    onSelectFormat?: (urlId: string) => void;
    onOpenBrowser?: (url: string) => void;
    onPlay?: (urlId: string) => void;
}

interface ActionsCellProps extends ActionsCellHandlers, ActionsCellState {
    item: HistoryItem;
    downloadTitle: string;
    downloadDisabled: boolean;
    urlId: string;
    enableFormatSelection?: boolean;
}

export const ActionsCell: React.FC<ActionsCellProps> = ({
    item,
    downloadTitle,
    downloadDisabled,
    urlId,
    onDownload,
    onStop,
    onResume,
    onRemoveFile,
    onDelete,
    onSelectFormat,
    onPlay,
    enableFormatSelection,
    isDownloadPending,
    isStopPending,
    isResumePending,
    isRemovePending,
    isDeletePending,
    isFormatPending
}) => {
    const status = item.status || '';
    const isActive = status === 'downloading' || status === 'queued';
    const isFormatSelect = enableFormatSelection && status === 'format-select';
    const fileExists = Boolean(item.filePath);
    const downloadBusy = Boolean(isDownloadPending);
    const stopBusy = Boolean(isStopPending);
    const resumeBusy = Boolean(isResumePending);
    const removeBusy = Boolean(isRemovePending);
    const deleteBusy = Boolean(isDeletePending);
    const rawFormatOptions = Array.isArray(item.formatOptions) ? item.formatOptions : [];
    const formatSelectionAvailable = Boolean(onSelectFormat) && rawFormatOptions.length > 0;
    const hasFormatOptions = formatSelectionAvailable;
    const formatBusy = Boolean(isFormatPending);
    const baseCanDownload = !downloadDisabled && !downloadBusy;
    const effectiveDownloadBusy = isFormatSelect && formatSelectionAvailable ? formatBusy : downloadBusy;
    const downloadButtonDisabled = isFormatSelect
        ? formatSelectionAvailable
            ? !hasFormatOptions || formatBusy
            : !baseCanDownload
        : !baseCanDownload;
    const downloadButtonTitle = isFormatSelect
        ? formatSelectionAvailable
            ? hasFormatOptions
                ? '포맷 선택'
                : '선택 가능한 포맷이 없습니다.'
            : downloadTitle
        : downloadTitle;

    const handleClick = (handler: ((id: string) => void) | undefined) => (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!handler) {
            return;
        }
        event.preventDefault();
        handler(urlId);
    };

    const handleDownload = isFormatSelect && formatSelectionAvailable
        ? handleClick(onSelectFormat)
        : handleClick(onDownload);

    const handlePlay = handleClick(onPlay);

    return (
        <>
            <button
                className="icon-button stop-button"
                data-url-id={urlId}
                title="다운로드 정지"
                aria-label="다운로드 정지"
                disabled={!isActive || stopBusy}
                onClick={handleClick(onStop)}
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
                disabled={isActive || resumeBusy || Boolean(isFormatSelect)}
                onClick={handleClick(onResume)}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3a8.959 8.959 0 0 0-7 3.339V4H3v6h6V8H6.274a6.982 6.982 0 1 1-1.054 5.751l-1.936.5A9 9 0 1 0 12 3z"/>
                </svg>
            </button>
            <button
                className="icon-button download-button"
                data-url-id={urlId}
                title={downloadButtonTitle}
                aria-label={downloadButtonTitle}
                disabled={downloadButtonDisabled}
                data-loading={effectiveDownloadBusy ? 'true' : undefined}
                aria-busy={effectiveDownloadBusy ? 'true' : undefined}
                onClick={handleDownload}
            >
                <span className="spinner" aria-hidden="true" />
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11.292 16.706a1 1 0 0 0 1.416 0l3-3a1 1 0 0 0-1.414-1.414L13 13.586V4a1 1 0 0 0-2 0v9.586l-1.293-1.293a1 1 0 0 0-1.414 1.414zM17 19H7a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2z"/>
                </svg>
            </button>
            <button
                className="icon-button play-button"
                data-url-id={urlId}
                title={fileExists ? '파일 재생' : '재생할 파일이 없습니다.'}
                aria-label="파일 재생"
                disabled={!fileExists || Boolean(isFormatSelect)}
                onClick={handlePlay}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" />
                </svg>
            </button>
            <button
                className="icon-button remove-file-button"
                data-url-id={urlId}
                title={fileExists ? '파일만 삭제' : '삭제할 파일이 없습니다.'}
                aria-label="파일 삭제"
                disabled={!fileExists || removeBusy || Boolean(isFormatSelect)}
                onClick={handleClick(onRemoveFile)}
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
                onClick={handleClick(onDelete)}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1z" />
                </svg>
            </button>
        </>
    );
};
