import { HistoryType, IResponse, ServerMessageStatus } from './types';

export const checkItem = async (urlId: string): Promise<IResponse & { data?: HistoryType }> => {
  try {
    const result = await chrome.storage.local.get('history');
    const history = result.history as HistoryType;

    if (!history || !history.data) {
      return {
        success: false,
      };
    }

    if (urlId === '') {
      return { success: true, data: history };
    }

    return {
      success: history.data.includes(urlId),
    };
  } catch (error: any) {

    return {
      success: false,
      error: error.message as string,
    }
  }
}

export const getItem = async (): Promise<HistoryType> => {
  const result = await chrome.storage.local.get('history');
  const history = result.history as HistoryType;

  if (!history || !history.data) {
    return { data: [] };
  }

  return history;
}

type sessionHistory = {
  [key: string]: {
    title: string;
    date: string;
    status: ServerMessageStatus;
    error?: string;
    percent?: number;
  };
}

export const setSessionItem = (urlId: string, title: string, status?: ServerMessageStatus) => {
  const sessionObj: sessionHistory = {};
  const date = new Date().toISOString();
  sessionObj[urlId] = {
    title,
    date,
    status: status || 'started',
  };

  chrome.storage.session.set(sessionObj)
}
export const setItems = async (urlIds: string[]) => {
  let error;

  try {
    const historySet = await getItem();

    // 중복 체크
    for (const urlId of urlIds) {
      if (!historySet.data.includes(urlId)) {
        historySet.data.push(urlId);
      }
    }

    // 실제 저장
    await chrome.storage.local.set({ history: historySet });

    return {
      success: true,
      error: null,
      data: historySet
    };
  } catch (e: any) {
    console.error('저장 에러', e);
    error = e.message as string;

    return {
      success: false,
      error: error,
      data: null
    };
  }
}

export const setItem = async (urlId: string, title: string) => {
  let error;

  try {
    const historySet = await getItem();

    // 중복 체크
    if (!historySet.data.includes(urlId)) {
      historySet.data.push(urlId);
    } else {
      // remove item
      console.log('remove item', urlId);
      historySet.data = historySet.data.filter(id => id !== urlId);
    }

    // 실제 저장
    await chrome.storage.local.set({ history: historySet });

    return {
      success: true,
      error: null,
      data: historySet
    };
  } catch (e: any) {
    console.error('저장 에러', e);
    error = e.message as string;

    return {
      success: false,
      error: error,
      data: null
    };
  }
}

export const deleteItem = async (urlId: string) => {
  try {
    const historySet = await getItem();

    // 배열에서 제거
    historySet.data = historySet.data.filter(id => id !== urlId);

    // 실제 저장
    await chrome.storage.local.set({ history: historySet });

    return true;
  } catch (error) {
    console.error('삭제 에러', error);
    return false;
  }
}

export const deleteAllItem = async () => {
  await chrome.storage.local.clear();
  return true;
}

export const restoreHistory = async (historyData: string[]): Promise<IResponse> => {
  try {
    await chrome.storage.local.set({ history: { data: historyData } });
    return { success: true };
  } catch (error: any) {
    console.error('Restore failed:', error);
    return { success: false, error: error.message as string };
  }
};

// Set을 사용하고 싶다면 이렇게 변환
export const setItemWithSet = async (urlId: string) => {
  let error;

  try {
    const historySet = await getItem();

    // 배열을 Set으로 변환하여 중복 제거
    const dataSet = new Set(historySet.data);
    dataSet.add(urlId);

    // 다시 배열로 변환하여 저장
    const updatedHistory = { data: Array.from(dataSet) };
    await chrome.storage.local.set({ history: updatedHistory });

    return {
      success: true,
      error: null,
      data: updatedHistory
    };
  } catch (e: any) {
    console.error('저장 에러', e);
    error = e.message as string;

    return {
      success: false,
      error: error,
      data: null
    };
  }
}