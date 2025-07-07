import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const Options = () => {
  const [apiKey, setApiKey] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [speechRate, setSpeechRate] = useState<number>(1.0);

  useEffect(() => {
    // Restore options from chrome.storage
    chrome.storage.local.get(
      {
        key: 'history'
      },
      (history) => {
        console.log('history loading end', history)
      }
    );
  }, []);

  const saveOptions = () => {
    // Save options to chrome.storage.sync
    chrome.storage.sync.set(
      {
        openaiApiKey: apiKey,
        speechRate: speechRate,
      },
      () => {
        // Update status to let user know options were saved
        setStatus("Options saved.");
        const id = setTimeout(() => {
          setStatus("");
        }, 1000);
        return () => clearTimeout(id);
      }
    );
  };

  const downloadHistory = async () => {
    const history = await chrome.storage.local.get('history');

    const fileText = history.toString();   //파일에 저장될 본문

    var fileBlob = new Blob([fileText], {   //가상의 파일시스템
      type: 'text/plain'
    });
    var fileUrl = URL.createObjectURL(fileBlob);    //다운로드 가능한 url 생성
    var fileName = 'mytextfile.txt';    //저장될 파일명, 경로. 크롬에 설정된 다운로드 경로에 저장

    var fileOptions = {
      filename: fileName,
      url: fileUrl,
    };
    //fileOptions.saveAs = true;    //저장 시 다운로드 창(어디에 다운할지 정하는 대화창) 띄우기

    chrome.downloads.download(fileOptions); //크롬 다운로드 api
  }

  return (
    <>
      <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
        <h1>Image Analyzer Options</h1>

        <div style={{ marginBottom: "20px" }}>
          <h2>OpenAI API Key</h2>
          <p>
            Enter your OpenAI API key to enable image analysis. You can get an API key from{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              OpenAI's website
            </a>.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "5px" }}
            placeholder="sk-..."
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h2>Speech Settings</h2>
          <label>
            Speech Rate:
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speechRate}
              onChange={(event) => setSpeechRate(parseFloat(event.target.value))}
              style={{ width: "100%", marginTop: "5px" }}
            />
            {speechRate.toFixed(1)}
          </label>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h2>Keyboard Shortcuts</h2>
          <ul>
            <li><strong>Ctrl+Shift+V</strong> (or <strong>Command+Shift+V</strong> on macOS): Select the first image on the page</li>
            <li><strong>Ctrl+Shift+Up</strong> (or <strong>Command+Shift+Up</strong> on macOS): Select the previous image</li>
            <li><strong>Ctrl+Shift+Down</strong> (or <strong>Command+Shift+Down</strong> on macOS): Select the next image</li>
            <li><strong>Ctrl+Shift+I</strong> (or <strong>Command+Shift+I</strong> on macOS): Analyze the selected image with OpenAI</li>
          </ul>
          <p><em>Note: Only images larger than 50 pixels in width or height will be selected.</em></p>
        </div>

        <div style={{ marginTop: "20px" }}>
          <button 
            onClick={saveOptions}
            style={{ padding: "10px 20px", backgroundColor: "#4285f4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            Save Options
          </button>
          <button
            onClick={downloadHistory}
            style={{ padding: "10px 20px", backgroundColor: "#4285f4", color: "white" }}
            >
            Download History
          </button>
          <div style={{ marginTop: "10px", color: "green" }}>{status}</div>
        </div>
      </div>
    </>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
