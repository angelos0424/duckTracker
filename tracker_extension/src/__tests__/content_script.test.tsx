
jest.mock('../services/Observer');
jest.mock('../services/ToolbarService');

describe('ContentScript', () => {
  let Observer: jest.Mock;
  let ToolbarService: {
    createToolbar: jest.Mock;
    removeAllToolbars: jest.Mock;
  };
  let onMessageListener: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => void;
  let mockObserverInstance: { init: jest.Mock };

  beforeEach(() => {
    jest.resetModules();

    const observerModule = require('../services/Observer');
    Observer = observerModule.Observer;
    const toolbarModule = require('../services/ToolbarService');
    ToolbarService = toolbarModule.ToolbarService;

    mockObserverInstance = { init: jest.fn() };
    Observer.mockImplementation(() => mockObserverInstance);

    jest.spyOn(chrome.runtime.onMessage, 'addListener').mockImplementation(listener => {
      onMessageListener = listener;
    });

    require('../content_script');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should initialize Observer on script load', () => {
    expect(Observer).toHaveBeenCalledTimes(1);
    expect(mockObserverInstance.init).toHaveBeenCalledTimes(1);
  });

  test('should call removeAllToolbars and re-initialize observer on url_changed message', () => {
    onMessageListener({ action: 'url_changed', text: 'some_url' }, {} as chrome.runtime.MessageSender, jest.fn());
    expect(ToolbarService.removeAllToolbars).toHaveBeenCalledTimes(1);
    expect(mockObserverInstance.init).toHaveBeenCalledTimes(2);
  });

  test('should not do anything for other messages', () => {
    onMessageListener({ action: 'some_other_action', text: 'some_data' }, {} as chrome.runtime.MessageSender, jest.fn());
    expect(ToolbarService.removeAllToolbars).not.toHaveBeenCalled();
    expect(mockObserverInstance.init).toHaveBeenCalledTimes(1);
  });
});
