
import { apiService } from './services/ApiService';
import useHistoryStore from './store/index';
import { ServerMessageStatus } from './types';

type ServerMessage = {
  status: ServerMessageStatus;
  url: string;
  urlId: string;
  error?: string;
  percent?: number;
  title: string;
}

const downloadInitiatorTabs = new Map<string, number>();

const sendMsg = (tabId: number, action: string, text: any) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      // Tab does not exist, it was likely closed.
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

const checkDownloads = async () => {
  const downloads = await apiService.get('downloads');
  for (const download of downloads) {
    const data: ServerMessage = download;
    const tabId = downloadInitiatorTabs.get(data.urlId);

    useHistoryStore.getState().setSessionItem(data.urlId, data.title, data.status, data.percent, data.error);

    const isDownloadFinished = data.status === 'completed' || data.status === 'error' || data.status === 'stop';

    if (isDownloadFinished) {
      downloadInitiatorTabs.delete(data.urlId);
    }

    if (tabId) {
      if (data.status === 'completed') {
        useHistoryStore.getState().addToHistory(data.urlId, data.title).then(() => {
          console.log('completed', data);
          sendMsg(tabId, 'download_status', data);
        });
      } else {
        sendMsg(tabId, 'download_status', data);
      }
    } else {
      if (isDownloadFinished) return; // Don't broadcast finished messages to all tabs
      // If we don't know which tab started it (e.g. after a service worker restart),
      // send to all YouTube tabs.
      console.warn(`No specific tab found for urlId: ${data.urlId}. Broadcasting to all YouTube tabs.`);
      sendMsgToAllYouTubeTabs('download_status', data);
    }
  }
}

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
  const { addToHistory, clearHistory, removeFromHistory, checkHistory } = useHistoryStore.getState();

  if (message.action === 'check') {
    // This should be handled by the store now
    checkHistory(message.text).then(res => sendResponse({success: res}))
    return true;

  } else if (message.action === 'save_history') {
    const { url, urlId } = message.text;
    // Todo save title?
    addToHistory(urlId, '').then((res) => {
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
    if (tabId && message.text.urlId) {
      downloadInitiatorTabs.set(message.text.urlId, tabId);
      apiService.post('download', message.text).then(res => {
        sendMsg(tabId, 'download_status', res.data);
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

function connectWebSocket() {
  const ws = new WebSocket('ws://localhost:8080');

  ws.onopen = () => {
    console.log('WebSocket connected');
    useHistoryStore.getState().getHistory().then(res => {
      console.log('[sync-history] send data to server : ', res);
      ws.send(JSON.stringify({ type: 'sync-history', data: res }));
    })
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      console.log('Received message:', message);


      if (message.type === 'download-finished') {
        console.log('Download finished:', message.payload);
        // You can add logic here to update the UI or notify the user
      } else if (message.type === 'sync-history') {
        const missingHistories = message.data;
        console.log('Syncing missing histories:', missingHistories);
        useHistoryStore.getState().syncHistoryFromServer(missingHistories)
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

connectWebSocket();
