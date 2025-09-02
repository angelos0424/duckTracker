
class ApiService {
  private apiUrl: string = 'http://localhost:8080';

  constructor() {
    this.loadApiUrl();
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.apiUrl) {
        this.apiUrl = changes.apiUrl.newValue;
      }
    });
  }

  private loadApiUrl() {
    chrome.storage.sync.get(['apiUrl'], (result) => {
      if (result.apiUrl) {
        this.apiUrl = result.apiUrl;
      }
    });
  }

  async get(endpoint: string) {
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
}

export const apiService = new ApiService();
