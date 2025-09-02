
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
      <h1>트래커 테스트</h1>

      <div className="api-url-container">
        <label htmlFor="api-url">API URL:</label>
        <input type="text" id="api-url" value={apiUrl} onChange={handleApiUrlChange} />
        <button onClick={saveApiUrl}>Save</button>
      </div>

      <button onClick={() => chrome.runtime.sendMessage({ action: "toggle_toolbar_visibility" })}>
        Toggle Toolbar (툴바 show/hidden)
      </button>

      <button onClick={clickDeleteButton} disabled={isLoading}>
        저장된 history 모두 삭제
      </button>

      <button onClick={downloadHistoryToTxt}>
        History Backup ( Download to txt file )
      </button>

      <button onClick={uploadHistory} disabled={isLoading}>
        History Restore ( Upload from txt file )
      </button>

      <button onClick={() => chrome.runtime.sendMessage({ action: "recreate_toolbars" })}>
        Init Toolbars
      </button>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".txt"
        onChange={handleFileChange}
      />

      <dialog ref={modalRef}>
        <h1>모든 history를 삭제합니다.</h1>
        <button onClick={() => modalRef.current?.close()}>Close</button>
        <button onClick={deleteAllHistory}>모두삭제</button>
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
