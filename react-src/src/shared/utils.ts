import {UrlInfo} from "../types/types";

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const formatDuration = (seconds: number) => {
  if (seconds === 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  let result = '';
  if (hours > 0) {
    result += `${hours}h `;
  }
  if (minutes > 0 || hours > 0) { // Show minutes if there are hours or if it's the only unit
    result += `${minutes}m `;
  }
  result += `${remainingSeconds}s`;

  return result.trim();
};

export const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString(); // Adjust as needed for specific format
};

export const validateUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// 이미 validation이 끝난 후임.
export const extractUrlId = (url: string) => {
  let result: UrlInfo = {
    type: 'Unknown',
    urlId: ''
  };
  const urlObj = new URL(url);

  if (urlObj.searchParams.has('list')) {
    result.type = 'Playlist';
    result.urlId = urlObj.searchParams.get('list') || '';
  } else if (url.startsWith('https://www.youtube.com/watch?v=')) {
    result.type = 'Video';
    result.urlId = urlObj.searchParams.get('v') || '';
  } else if (url.startsWith('https://www.youtube.com/shorts')) {
    result.type = 'Shorts'
    result.urlId = urlObj.pathname.split('/')[2] || '';
  }

  return result;
}