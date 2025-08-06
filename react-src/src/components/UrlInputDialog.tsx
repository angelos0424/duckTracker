import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UrlInputDialogProps } from '../types/types';
import {validateUrl} from "../shared/utils";

const UrlInputDialog: React.FC<UrlInputDialogProps> = ({ isOpen, onClose, onConfirm, getUrlFromClipboard }) => {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePasteFromClipboard = useCallback(async () => {
    const getClipboardText = await getUrlFromClipboard();

    const isValid = validateUrl(getClipboardText);

    if (isValid) {
      setUrl(getClipboardText);
    } else {
      setUrl('');

      alert("올바르지 않은 URL입니다.")
    }
  }, [getUrlFromClipboard]);

  useEffect(() => {
    if (isOpen) {
      setUrl(''); // Clear URL when dialog opens
      handlePasteFromClipboard();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose, handlePasteFromClipboard]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      inputRef.current?.select();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      e.preventDefault();
      handlePasteFromClipboard();
    }
  }, [handlePasteFromClipboard]);

  const handleConfirm = () => {
    if (url.trim()) {
      onConfirm(url.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h2>Add New Download</h2>
        <p>Please enter the YouTube video URL:</p>
        <input
          ref={inputRef}
          type="text"
          className="url-input"
          placeholder="e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <div className="dialog-actions">
          <button className="paste-button" onClick={handlePasteFromClipboard}>
            Paste from Clipboard
          </button>
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button className="confirm-button" onClick={handleConfirm} disabled={!url.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default UrlInputDialog;
