class ApiService {
  private apiUrl = 'http://localhost:8080';

  constructor() {
    this.loadApiUrl();
    chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => {
      if (namespace === 'sync' && changes.apiUrl?.newValue) {
        this.apiUrl = changes.apiUrl.newValue as string;
      }
    });
  }

  private loadApiUrl(): void {
    chrome.storage.sync.get(['apiUrl'], (result: { apiUrl?: string }) => {
      if (result.apiUrl) {
        this.apiUrl = result.apiUrl;
      }
    });
  }

  async get<T>(endpoint: string): Promise<T> {
    console.log(`[Req] GET ${this.apiUrl}/${endpoint}`);
    try {
      const response = await fetch(`${this.apiUrl}/${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as T;
      console.log('[Res] OK', data);
      return data;
    } catch (error) {
      console.error('[Res] Error', error);
      throw error;
    }
  }

  async post<TRequest, TResponse>(endpoint: string, data: TRequest): Promise<TResponse> {
    const response = await fetch(`${this.apiUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as TResponse;
  }
}

export const apiService = new ApiService();
