import * as React from 'react';
import { useIPC } from '../hooks/useIPC';
import {extractUrlId, validateUrl} from "../../shared/utils/urlParser";

interface UrlInputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
}

const UrlInputDialog: React.FC<UrlInputDialogProps> = ({ isOpen, onClose, onConfirm }) => {
  const [url, setUrl] = React.useState('');
  const ipc = useIPC();

  React.useEffect(() => {
    if (isOpen) {
      const fetchClipboard = async () => {
        try {
          const clipboardText = await ipc.getClipboardText();

          const isValid = validateUrl(clipboardText);

          if (isValid) {
            setUrl(clipboardText);
          }
        } catch (error) {
          console.error('Failed to read clipboard:', error);
        }
      };
      fetchClipboard();
    } else {
      setUrl(''); // Clear URL when dialog closes
    }
  }, [isOpen, ipc]);

  const handleConfirm = () => {
    if (url.trim()) {
      onConfirm(url.trim());
      onClose();
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await ipc.getClipboardText();

      const isValid = validateUrl(clipboardText);

      if (isValid) {
        setUrl(clipboardText);
      }
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog-content">
        <h2>Add New Download</h2>
        <p>Enter the URL of the video you want to download:</p>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter video URL"
          className="url-input"
        />
        <div className="dialog-actions">
          <button onClick={handlePaste} className="paste-button">Paste from Clipboard</button>
          <button onClick={handleConfirm} className="confirm-button">Confirm</button>
          <button onClick={onClose} className="cancel-button">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default UrlInputDialog;
