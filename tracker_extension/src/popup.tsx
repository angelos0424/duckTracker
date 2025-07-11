import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ServiceContext } from "./contexts/ServiceContext";
import { Observer } from "./services/Observer";
import { ToolbarService } from "./services/ToolbarService";
import { SidePanel } from "./component/SidePanel";

import './popup.css';

const Popup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [observerInstance, setObserverInstance] = useState<Observer | null>(null);

  useEffect(() => {
    // Todo : sync에 저장해놓은 설정 불러오기.
    // ex: storage = local / sync
    // show Toolbar togglebutton
  }, []);

  const activeButton = () => {
    chrome.runtime.sendMessage({
      action: "attach-button",
      text: "attach-button",
    });
  };

  const clickDeleteButton = () => {
    modalRef.current?.showModal();
  };

  const deleteAllHistory = () => {
    chrome.runtime.sendMessage({ action: "deleteAllHistory" }, (response) => {
      modalRef.current?.close();
    });
  };

  const downloadHistoryToTxt = () => {
    chrome.storage.local.get("history", (result) => {
      const texts = result.history?.data?.join(", ") || "";

      const blob = new Blob([texts], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      const filename = "history_backup.txt";
      chrome.downloads.download(
        {
          url,
          filename: filename,
          saveAs: true,
        },
        (downloadId) => {
          URL.revokeObjectURL(url);
        }
      );
    });
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

      chrome.storage.local.set({'history':{ "data" : textList}}, () => {
        if (chrome.runtime.lastError) {
          console.error("Restore failed:", chrome.runtime.lastError);
        } else {
        }
      });
    };

    reader.readAsText(file);
  };

  return (
    <ServiceContext.Provider value={{ observer: observerInstance, toolbarService: ToolbarService }}>
      <div className="popup-container">
        <h1>트래커 테스트</h1>

        <button onClick={activeButton}>테스트 버튼</button>

        <button onClick={() => chrome.runtime.sendMessage({ action: "toggle_toolbar_visibility" })}>
          Toggle Toolbar
        </button>

        <button onClick={() => chrome.runtime.sendMessage({ action: "toggle_side_panel_visibility" })}>
          Show Download History
        </button>

        <button onClick={clickDeleteButton} disabled={isLoading}>
          저장된 history 모두 삭제
        </button>

        <button onClick={downloadHistoryToTxt} disabled={isLoading}>
          Download History
        </button>

        <button onClick={uploadHistory} disabled={isLoading}>
          Upload History
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
    </ServiceContext.Provider>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);