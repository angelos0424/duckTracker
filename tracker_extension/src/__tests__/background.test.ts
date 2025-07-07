
jest.mock('../storage');

describe('background script', () => {
  let checkItem: jest.Mock, setItem: jest.Mock, deleteItem: jest.Mock, deleteAllItem: jest.Mock;
  let onMessageListener: any; // Use 'any' to avoid complex type issues in test
  let onUpdatedListener: (tabId: number, changeInfo: any, tab: any) => void;

  beforeEach(() => {
    jest.resetModules();

    const storage = require('../storage');
    checkItem = storage.checkItem;
    setItem = storage.setItem;
    deleteItem = storage.deleteItem;
    deleteAllItem = storage.deleteAllItem;

    jest.spyOn(chrome.runtime.onMessage, 'addListener').mockImplementation(listener => {
      onMessageListener = listener;
    });
    jest.spyOn(chrome.tabs.onUpdated, 'addListener').mockImplementation(listener => {
      onUpdatedListener = listener;
    });

    require('../background');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should send message on url change', () => {
    const tab = { id: 1, url: 'https://www.youtube.com/watch?v=123' };
    (chrome.tabs.query as jest.Mock).mockImplementation((_, callback) => callback([tab]));

    onUpdatedListener(tab.id, { status: 'complete' }, tab);

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true }, expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(tab.id, {
      action: 'url_changed',
      text: { url: tab.url, changeInfo: { status: 'complete' } },
    });
  });

  test('should handle check message', async () => {
    checkItem.mockResolvedValue(false);
    const sendResponse = jest.fn();
    const promise = onMessageListener({ action: 'check', text: 'video1' }, {}, sendResponse);
    expect(promise).toBe(true);
    await new Promise(process.nextTick);
    expect(checkItem).toHaveBeenCalledWith('video1');
    expect(sendResponse).toHaveBeenCalledWith(false);
  });

  test('should handle save_history message', async () => {
    setItem.mockResolvedValue({ success: true });
    const sendResponse = jest.fn();
    const promise = onMessageListener({ action: 'save_history', text: 'video1' }, {}, sendResponse);
    expect(promise).toBe(true);
    await new Promise(process.nextTick);
    expect(setItem).toHaveBeenCalledWith('video1');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('should handle remove message', () => {
    deleteItem.mockReturnValue({ success: true });
    const sendResponse = jest.fn();
    onMessageListener({ action: 'remove', text: 'video1' }, {}, sendResponse);
    expect(deleteItem).toHaveBeenCalledWith('video1');
    expect(sendResponse).toHaveBeenCalledWith({ success: { success: true } });
  });

  test('should handle deleteAllHistory message', async () => {
    deleteAllItem.mockResolvedValue(undefined);
    const sendResponse = jest.fn();
    const promise = onMessageListener({ action: 'deleteAllHistory', text: null }, {}, sendResponse);
    expect(promise).toBe(true);
    await new Promise(process.nextTick);
    expect(deleteAllItem).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(true);
  });
});
