import { create } from 'zustand';
import {
  getItem as getHistoryItems,
  setItem as setHistoryItem,
  deleteItem as deleteHistoryItem,
  deleteAllItem as deleteAllHistoryItems,
  restoreHistory as restoreHistoryItems,
  setItems,
} from '../storage';
import {DownloadItem, HistoryType, ServerMessageStatus} from '../types';

type HistoryState = {
  history: string[];
  sessionHistory: Record<string, DownloadItem>;
  isLoading: boolean;
};

type HistoryActions = {
  getHistory: () => Promise<HistoryType>;
  loadHistory: () => Promise<void>;
  syncHistoryFromServer: (urlIds: string[]) => Promise<boolean>;
  checkHistory: (urlId: string) => Promise<boolean>;
  addToHistory: (urlId: string, title: string) => Promise<boolean>;
  toggleHistory: (urlId: string) => Promise<boolean>;
  removeFromHistory: (urlId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  restoreHistory: (historyData: string[]) => Promise<void>;
  setSessionItem: (urlId: string, title: string, status: ServerMessageStatus, percent?: number, error?: string) => void;
};

const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => {
  const persistAddition = async (urlId: string, title: string) => {
    const res = await setHistoryItem(urlId, title);
    if (res.success) {
      set((state) => ({ history: [...state.history, urlId] }));
    }
    return res.success;
  };

  const persistRemoval = async (urlId: string) => {
    await deleteHistoryItem(urlId);
    set((state) => ({ history: state.history.filter((item) => item !== urlId) }));
  };

  const withHistoryItem = async <T>(urlId: string, handlers: {
    onExists: () => Promise<T>;
    onMissing: () => Promise<T>;
  }): Promise<T> => {
    const history = await getHistoryItems();
    return history.data.includes(urlId)
      ? handlers.onExists()
      : handlers.onMissing();
  };

  return {
    history: [],
    sessionHistory: {},
    isLoading: false,

    getHistory: async () => {
      return await getHistoryItems()
    },

    loadHistory: async () => {
      set({ isLoading: true });
      const history = await getHistoryItems();
      set({ history: history.data, isLoading: false });
    },

    syncHistoryFromServer: async (missingHistories: string[]) => {
      try {
        const res = await setItems(missingHistories);
        set((state) => ({ history: [...state.history, ...missingHistories] }));
        return res.success
      } catch (e) {
        return false
      }
    },

    checkHistory: async (urlId: string) => {
      const history = await getHistoryItems();
      return history.data.includes(urlId)
    },

    addToHistory: async (urlId, title) => {
      try {
        // return value mean isChecked.
        return await withHistoryItem(urlId, {
          onExists: async () => false,
          onMissing: () => persistAddition(urlId, title),
        });
      } catch (e) {
        return false
      }
    },

    toggleHistory: async (urlId) => {
      try {
        return await withHistoryItem(urlId, {
          onExists: async () => {
            await persistRemoval(urlId);
            return false;
          },
          onMissing: () => persistAddition(urlId, ''),
        });
      } catch (e) {
        return false
      }
    },

    removeFromHistory: async (urlId) => {
      await persistRemoval(urlId);
    },

    clearHistory: async () => {
      await deleteAllHistoryItems();
      set({ history: [] });
    },

    restoreHistory: async (historyData) => {
      await restoreHistoryItems(historyData);
      set({ history: historyData });
    },

    setSessionItem: (urlId, title, status, percent, error) => {
      set((state) => ({
        sessionHistory: {
          ...state.sessionHistory,
          [urlId]: {
            title,
            date: new Date().toISOString(),
            status,
            percent,
            error,
          },
        },
      }));
    }
  };
});

export default useHistoryStore;
