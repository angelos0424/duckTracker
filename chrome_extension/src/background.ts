
import { apiService } from './services/ApiService';
import useHistoryStore from './store/index';
import { ServerMessageStatus, BrowserDownloadStatus } from './types';

type ServerMessage = {
  status: ServerMessageStatus;
  url: string;
  urlId: string;
  error?: string;
  percent?: number;
  title: string;
}

type DownloadStatusMessage = {
  urlId: string;
  status: BrowserDownloadStatus;
  percent: number;
  error?: string;
  url?: string;
  title?: string;
};

const downloadInitiatorTabs = new Map<string, number>();

const sendMsg = (tabId: number, action: string, text: any) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.log(`Tab ${tabId} not found, removing from download tracking.`);
      for (const [urlId, id] of downloadInitiatorTabs.entries()) {
        if (id === tabId) {
          downloadInitiatorTabs.delete(urlId);
        }
      }
      return;
    }

    // Tab exists, try sending a message.
    chrome.tabs.sendMessage(tabId, { action, text }).catch(error => {
      if (error.message.includes('Receiving end does not exist')) {
        // Content script might not be injected yet or tab is not a youtube page.
        // This is not a critical error.
      } else {
        console.error(`Failed to send message to tab ${tabId}:`, error);
      }
    });
  });
};

const sendMsgToAllYouTubeTabs = (action: string, data: any) => {
  chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        sendMsg(tab.id, action, data);
      }
    });
  });
};

const toBrowserStatus = (status: ServerMessageStatus): BrowserDownloadStatus | null => {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'error') {
    return 'error';
  }
  if (status === 'progress') {
    return 'progress';
  }
  if (status === 'downloading' || status === 'queued' || status === 'started') {
    return 'progress';
  }
  if (status === 'stop') {
    return 'error';
  }

  return null;
};

const buildDownloadStatusMessage = (data: ServerMessage): DownloadStatusMessage | null => {
  const status = toBrowserStatus(data.status);
  if (!status) {
    return null;
  }

  const percent = status === 'completed'
    ? 100
    : typeof data.percent === 'number'
      ? Math.max(0, Math.round(data.percent))
      : 0;

  return {
    urlId: data.urlId,
    status,
    percent,
    error: data.error,
    url: data.url,
    title: data.title,
  };
};

const deliverDownloadUpdate = (data: ServerMessage) => {
  if (!data || !data.urlId) {
    return;
  }

  useHistoryStore.getState().setSessionItem(data.urlId, data.title, data.status, data.percent, data.error);

  const message = buildDownloadStatusMessage(data);
  if (!message) {
    return;
  }

  const isDownloadFinished = message.status === 'completed' || message.status === 'error';

  if (isDownloadFinished) {
    downloadInitiatorTabs.delete(data.urlId);
  }

  if (message.status === 'completed') {
    useHistoryStore.getState().addToHistory(data.urlId, data.title).then(() => {
      sendMsgToAllYouTubeTabs('download_status', message);
    })
    return;
  }

  if (isDownloadFinished && message.status !== 'progress') {
    console.warn(`No specific tab found for urlId: ${data.urlId}. Skipping broadcast of finished download.`);
    return;
  }

  console.warn(`No specific tab found for urlId: ${data.urlId}. Broadcasting progress to all YouTube tabs.`);
  sendMsgToAllYouTubeTabs('download_status', message);
};

const checkDownloads = async () => {
  const downloads = await apiService.get('downloads') as ServerMessage[];
  for (const download of downloads) {
    deliverDownloadUpdate(download);
  }
};

let lastUrl = '';
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    if (changeInfo.status === 'complete') {
      if ((tab.url && lastUrl !== tab.url) || tab.url === 'https://www.youtube.com/') {
        lastUrl = tab.url;
        sendMsg(tabId, 'url_changed', { url : tab.url, changeInfo });
      }
    }
  } catch (error) {
    if (tabId) {
      sendMsg(tabId, 'error', error);
    }
  }
});

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id; // popup.tsx에서 보낸 경우, 없다.
  const { toggleHistory, clearHistory, removeFromHistory, checkHistory } = useHistoryStore.getState();

  if (message.action === 'check') {
    // This should be handled by the store now
    checkHistory(message.text).then(res => sendResponse({success: res}))
    return true;

  } else if (message.action === 'save_history') {
    const { urlId } = message.text;
    // Todo save title ? how to get title in browser..
    toggleHistory(urlId).then((res) => {
      if (res) {
        apiService.post('save_history', message.text);
      }
      sendResponse({success: res})
    });
    return true;
  } else if (message.action === 'remove') {
    removeFromHistory(message.text).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.action === 'attach-button') {
    if (tabId) sendMsg(tabId, message.action, message.text);
  } else if (message.action === 'deleteAllHistory') {
    clearHistory().then(() => sendResponse(true));
    return true;
  } else if (message.action === 'log') {
    if (tabId) sendMsg(tabId, message.action, message.text);
  } else if (message.action === 'download') {
    if (typeof tabId === 'number' && message.text.urlId) {
      downloadInitiatorTabs.set(message.text.urlId, tabId);
      apiService.post('download', message.text)
        .then((res: ServerMessage) => {
          deliverDownloadUpdate(res);
        })
        .catch((error: unknown) => {
          console.error('Download request failed', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to start download';
          const fallback: DownloadStatusMessage = {
            urlId: message.text.urlId,
            status: 'error',
            percent: 0,
            error: errorMessage,
          };
          sendMsg(tabId, 'download_status', fallback);
        });
    } else {
      console.error('Download request received without tabId or urlId', message);
    }
    return true;
  } else if (message.action === 'stop_download') {
    apiService.post('stop_download', message.text);
    return true;
  } else if (message.action === 'toggle_toolbar_visibility') {
    sendMsgToAllYouTubeTabs(message.action, message.text);
  } else if (message.action === 'recreate_toolbars') {
    sendMsgToAllYouTubeTabs('remove_toolbar', {});
  }
});

const buildWebSocketUrl = async (): Promise<string> => {
  const apiUrl = await apiService.getApiUrl();
  try {
    const parsedUrl = new URL(apiUrl);
    parsedUrl.protocol = parsedUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return parsedUrl.toString();
  } catch (error) {
    console.error('Invalid apiUrl detected, falling back to ws://localhost:8080', apiUrl, error);
    return 'ws://localhost:8080';
  }
};

async function connectWebSocket() {
  let ws: WebSocket;
  try {
    const socketUrl = await buildWebSocketUrl();
    ws = new WebSocket(socketUrl);
  } catch (error) {
    console.error('Failed to initialize WebSocket connection, retrying...', error);
    setTimeout(connectWebSocket, 5000);
    return;
  }

  ws.onopen = () => {
    console.log('WebSocket connected');
    useHistoryStore.getState().getHistory().then(res => {
      ws.send(JSON.stringify({ type: 'sync-history', data: res }));
    })
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'download':
          deliverDownloadUpdate(message.payload as ServerMessage);
          break;
        case 'download-finished':
          deliverDownloadUpdate(message.payload as ServerMessage);
          break;
        case 'sync-history': {
          const missingHistories = message.data;
          useHistoryStore.getState().syncHistoryFromServer(missingHistories);
          break;
        }
        case 'download_status':
          deliverDownloadUpdate(message.data as ServerMessage);
          break;
        default:
          console.warn('Unhandled WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected, attempting to reconnect...');
    setTimeout(connectWebSocket, 5000); // Reconnect after 5 seconds
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    ws.close();
  };
}

connectWebSocket().catch(error => {
  console.error('Failed to start WebSocket connection:', error);
});
