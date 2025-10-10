
class ApiService {
  private apiUrl: string = 'http://localhost:8080';
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadApiUrl();
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.apiUrl) {
        const newValue = changes.apiUrl.newValue;
        this.apiUrl = typeof newValue === 'string' && newValue.length > 0
          ? newValue
          : 'http://localhost:8080';
      }
    });
  }

  private loadApiUrl(): Promise<void> {
    return new Promise(resolve => {
      chrome.storage.sync.get(['apiUrl'], (result) => {
        if (result.apiUrl) {
          this.apiUrl = result.apiUrl;
        }
        resolve();
      });
    });
  }

  async get(endpoint: string) {
    await this.ready;
    console.log(`[Req] GET ${this.apiUrl}/${endpoint}`);
    try {
      const response = await fetch(`${this.apiUrl}/${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log(`[Res] OK ${response.json()}`)
      return await response.json();
    } catch (error) {
      console.error(`[Res] Error ${error}`);
      throw error;
    }
  }

  async post(endpoint: string, data: any) {
    await this.ready;
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
    return await response.json();
  }

  async getApiUrl(): Promise<string> {
    await this.ready;
    return this.apiUrl;
  }
}

export const apiService = new ApiService();
