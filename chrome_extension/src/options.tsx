import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css"; // Reuse popup styles

const Options = () => {
  const [apiUrl, setApiUrl] = useState<string>("http://localhost:8080");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    // Restore options from chrome.storage.sync
    chrome.storage.sync.get(
      {
        apiUrl: "http://localhost:8080",
      },
      (items) => {
        setApiUrl(items.apiUrl);
      }
    );
  }, []);

  const saveOptions = () => {
    // Save options to chrome.storage.sync
    chrome.storage.sync.set(
      {
        apiUrl: apiUrl,
      },
      () => {
        setStatus("Options saved.");
        const id = setTimeout(() => {
          setStatus("");
        }, 2000);
        return () => clearTimeout(id);
      }
    );
  };

  return (
    <div className="popup-container" style={{ width: '600px', margin: '0 auto' }}>
      <h1>Extension Options</h1>

      <div className="card">
        <div className="section-label">General Configuration</div>
        <div className="api-url-container">
          <label htmlFor="api-url" style={{ whiteSpace: 'nowrap' }}>API URL:</label>
          <input
            type="text"
            id="api-url"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            className="text-input"
            placeholder="http://localhost:8080"
          />
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
          {status && <span style={{ color: 'var(--success-color)' }}>{status}</span>}
          <button
            onClick={saveOptions}
            className="btn btn-primary"
            style={{ width: 'auto' }}
          >
            Save Options
          </button>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
        YouTube Download Tracker • Version 1.0
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
