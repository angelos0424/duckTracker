import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ServiceContext } from "./contexts/ServiceContext";
import { Observer } from "./services/Observer";
import { ToolbarService } from "./services/ToolbarService";

const Popup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [observerInstance, setObserverInstance] = useState<Observer | null>(null);

  useEffect(() => {
    console.log("Popup opened");

    // Initialize Observer
    const onElementFoundCallback = (element: Element, isShorts: boolean) => {
      console.log("Element found by Observer:", element, "isShorts:", isShorts);
      // 여기에 필요한 로직 추가 (예: ToolbarService.createToolbar 호출 등)
      // 하지만 Popup 컴포넌트에서는 직접적인 DOM 조작을 피하는 것이 좋습니다.
      // ToolbarService.createToolbar는 content_script에서 호출되므로 여기서는 필요 없습니다.
    };

    const obs = new Observer(onElementFoundCallback);
    obs.init();
    setObserverInstance(obs);

    // Initial history check (existing logic)
    chrome.storage.local.get("history", (result) => {
      console.log("Initial history:", result);
    });

    return () => {
      obs.disconnect(); // Clean up observer on unmount
    };
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
      console.log("deleteAllHistory", response);
      modalRef.current?.close();
    });
  };

  const downloadHistory = () => {
    chrome.storage.local.get("history", (result) => {
      const texts = result.history?.data?.join(", ") || "";
      console.log("Download text:", texts);

      const blob = new Blob([texts], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      chrome.downloads.download(
        {
          url,
          filename: "history_backup.txt",
          saveAs: true,
        },
        (downloadId) => {
          console.log("Download started with ID:", downloadId);
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
          console.log("Restore complete:", textList);
        }
      });
    };

    reader.readAsText(file);
  };

  return (
    <ServiceContext.Provider value={{ observer: observerInstance, toolbarService: ToolbarService }}>
      <div style={{ padding: "20px", width: "400px" }}>
        <h1>트래커 테스트</h1>

        <button onClick={activeButton}>테스트 버튼</button>

        <button onClick={clickDeleteButton} disabled={isLoading}>
          저장된 history 모두 삭제
        </button>

        <button onClick={downloadHistory} disabled={isLoading}>
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