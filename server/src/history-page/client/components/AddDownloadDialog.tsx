import type { FC } from 'react';
import type { FormatOption } from '../types.js';
import type { DialogMode } from '../hooks/useDialogState.js';

interface AddDownloadDialogProps {
    open: boolean;
    mode: DialogMode;
    urlValue: string;
    errorMessage: string;
    isSubmitting: boolean;
    enableFormatSelection: boolean;
    formatOptions: FormatOption[];
    selectedFormatId: string;
    formatTitle: string;
    onClose: () => void;
    onSubmit: () => void;
    onUrlChange: (value: string) => void;
    onSelectFormat: (formatId: string) => void;
    onBack?: () => void;
}

function parseFormatLabel(label: string): string[] {
    const segments = label
        .split(/\s*\|\s*/u)
        .map((segment) => segment.trim())
        .filter(Boolean);
    return segments.length > 0 ? segments : [label];
}

export const AddDownloadDialog: FC<AddDownloadDialogProps> = ({
    open,
    mode,
    urlValue,
    errorMessage,
    isSubmitting,
    enableFormatSelection,
    formatOptions,
    selectedFormatId,
    formatTitle,
    onClose,
    onSubmit,
    onUrlChange,
    onSelectFormat,
    onBack
}) => {
    const isFormatMode = enableFormatSelection && mode === 'format';
    const confirmLabel = isSubmitting ? '요청 중...' : isFormatMode ? '다운로드 시작' : '다운로드 요청';

    return (
        <div className={`dialog-backdrop${open ? ' visible' : ''}`} data-dialog="add-download" hidden={!open}
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-download-title">
                <h2 id="add-download-title">{isFormatMode ? '포맷 선택' : '다운로드 추가'}</h2>
                <p>
                    {isFormatMode
                        ? formatTitle
                            ? `"${formatTitle}"에 사용할 포맷을 선택하세요.`
                            : '다운로드할 포맷을 선택하세요.'
                        : '다운로드할 영상의 URL을 입력하세요.'}
                </p>
                <form
                    data-form="add-download"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    {isFormatMode ? (
                        <div className="format-options" role="radiogroup" aria-label="포맷 선택">
                            {formatOptions.length > 0 ? (
                                formatOptions.map((option) => (
                                    <button
                                        type="button"
                                        key={option.id}
                                        role="radio"
                                        aria-checked={selectedFormatId === option.id}
                                        className={`format-option${selectedFormatId === option.id ? ' format-option--selected' : ''}`}
                                        onClick={() => onSelectFormat(option.id)}
                                        title={option.label}
                                    >
                                        <span className="format-option__chips">
                                            {parseFormatLabel(option.label).map((segment, index) => (
                                                <span className="format-option__chip" key={`${option.id}-chip-${index}`}>
                                                    {segment}
                                                </span>
                                            ))}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <p className="form-helper">선택 가능한 포맷이 없습니다. 잠시 후 다시 시도해주세요.</p>
                            )}
                        </div>
                    ) : (
                        <>
                            <label htmlFor="download-url" className="visually-hidden">
                                다운로드 URL
                            </label>
                            <input
                                type="url"
                                id="download-url"
                                name="url"
                                placeholder="https://"
                                required
                                value={urlValue}
                                onChange={(event) => onUrlChange(event.target.value)}
                            />
                        </>
                    )}
                    <p className="form-helper" data-error-message hidden={!errorMessage}>
                        {errorMessage || (isFormatMode ? '다운로드할 포맷을 선택해주세요.' : '유효한 URL을 입력해주세요.')}
                    </p>
                    <div className="dialog-buttons">
                        {isFormatMode && onBack ? (
                            <button
                                type="button"
                                className="button button--outline"
                                onClick={(event) => {
                                    event.preventDefault();
                                    onBack();
                                }}
                                disabled={isSubmitting}
                            >
                                이전
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="button button--outline"
                            data-action="cancel-dialog"
                            onClick={(event) => {
                                event.preventDefault();
                                onClose();
                            }}
                            disabled={isSubmitting}
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="button button--primary"
                            disabled={isSubmitting || (isFormatMode && formatOptions.length === 0)}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
