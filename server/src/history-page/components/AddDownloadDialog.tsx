import React from 'react';

interface AddDownloadDialogProps {
    enableFormatSelection?: boolean;
}

export const AddDownloadDialog: React.FC<AddDownloadDialogProps> = ({ enableFormatSelection }) => (
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
                    <button type="button" className="button button--outline" data-action="cancel-dialog">
                        취소
                    </button>
                    <button type="submit" className="button button--primary">
                        {enableFormatSelection ? '다운로드 요청' : '다운로드 요청'}
                    </button>
                </div>
            </form>
        </div>
    </div>
);
