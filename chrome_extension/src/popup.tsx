import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import useHistoryStore from "./store/index";

import './popup.css';

const Popup = () => {
  const {
    history,
    isLoading,
    loadHistory,
    clearHistory,
    restoreHistory,
  } = useHistoryStore();
  const modalRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiUrl, setApiUrl] = useState('http://localhost:8080');

  useEffect(() => {
    loadHistory();
    chrome.storage.sync.get(['apiUrl'], (result) => {
      if (result.apiUrl) {
        setApiUrl(result.apiUrl);
      }
    });
  }, [loadHistory]);

  const handleApiUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setApiUrl(event.target.value);
  };

  const saveApiUrl = () => {
    chrome.storage.sync.set({ apiUrl: apiUrl }, () => {
      // Small visual feedback could be added here preferably, but alert serves the purpose for now
      // changing to a more subtle console log or just assuming success for the modern UI flow 
      // or keeping alert but maybe styling it later. I'll keep alert as requested functionality is purely UI.
      alert('API URL saved!');
    });
  };

  const clickDeleteButton = () => {
    modalRef.current?.showModal();
  };

  const deleteAllHistory = () => {
    clearHistory();
    modalRef.current?.close();
  };

  const downloadHistoryToTxt = () => {
    const texts = history.join(", ");
    const blob = new Blob([texts], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const filename = "history_backup.txt";
    chrome.downloads.download(
      {
        url,
        filename: filename,
        saveAs: true,
      },
      () => {
        URL.revokeObjectURL(url);
      }
    );
  };

  const uploadHistory = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;
      const textList = text.split(", ");
      restoreHistory(textList);
    };

    reader.readAsText(file);
  };

  return (
    <div className="popup-container">
      <h1>YouTube Tracker</h1>

      <div className="card">
        <div className="section-label">Settings</div>
        <div className="api-url-container">
          <input
            type="text"
            id="api-url"
            value={apiUrl}
            onChange={handleApiUrlChange}
            className="text-input"
            placeholder="http://localhost:8080"
          />
          <button onClick={saveApiUrl} className="btn btn-primary btn-sm" style={{ width: 'auto' }}>
            Save
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Controls</div>
        <button
          className="btn btn-secondary"
          onClick={() => chrome.runtime.sendMessage({ action: "toggle_toolbar_visibility" })}
        >
          Toggle Toolbar
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => chrome.runtime.sendMessage({ action: "recreate_toolbars" })}
        >
          Reset Toolbars
        </button>
      </div>

      <div className="card">
        <div className="section-label">History Management</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={downloadHistoryToTxt}
            title="Download to .txt"
          >
            Backup
          </button>
          <button
            className="btn btn-secondary"
            onClick={uploadHistory}
            disabled={isLoading}
            title="Upload from .txt"
          >
            Restore
          </button>
        </div>

        <button
          className="btn btn-danger mt-2"
          onClick={clickDeleteButton}
          disabled={isLoading}
        >
          Clear All History
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".txt"
        onChange={handleFileChange}
      />

      <dialog ref={modalRef}>
        <h1>Delete All History?</h1>
        <p className="mb-2">This action cannot be undone.</p>
        <div className="dialog-buttons">
          <button className="btn btn-secondary btn-sm" onClick={() => modalRef.current?.close()}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={deleteAllHistory}>Delete</button>
        </div>
      </dialog>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
