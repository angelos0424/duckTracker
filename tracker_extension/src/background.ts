import {checkItem, setItem, deleteItem, deleteAllItem} from './storage'
// Listen for keyboard commands
const sendMsg = (action: string, text: any)=> {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action,
        text
      })
    }
  })
}

let lastUrl: string = ''; // useState 대신 일반 변수 사용
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

  try {
    if (tab.url && lastUrl !== tab.url && changeInfo.status === 'complete') {
      if (tab && tab.url?.indexOf("youtube.com") != -1) {
        lastUrl = tab.url; // setLastUrl 대신 직접 업데이트
        sendMsg('url_changed', { url : tab.url, changeInfo });
      }
    }
  } catch (error) {
    sendMsg('error', error)
  }
})

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'check') {
    // 저장 확인. 없으면 false, 있으면 true
    const res = checkItem(message.text).then(res => sendResponse(res));
    return true;
  } else if (message.action === 'save_history') {
    // Speak that analysis is starting
    const res = setItem(message.text).then(res => sendResponse(res));
    return true;
  } else if (message.action === 'remove') {
    const res = deleteItem(message.text);

    sendResponse({ success: res });
  } else if (message.action === 'attach-button') {
    sendMsg(message.action, message.text)
  } else if (message.action === 'deleteAllHistory') {
    deleteAllItem().then(()=> {
      sendResponse(true)
    })
    return true;
  } else if (message.action === 'log') {
    sendMsg(message.action, message.text)
  } else if (message.action === 'download') {
    fetch('http://localhost:3000/api/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ urlId: message.text})
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setItem(message.text).then(res => {
          sendResponse(res);
        });
      }

    })
    .catch(err => sendMsg('log', err));
    return true;
  } else if (message.action === 'toggle_toolbar_visibility') {
    sendMsg(message.action, message.text);
  }
});
