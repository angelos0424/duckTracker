import {UrlInfo} from "../types";

export interface ParsedUrl {
  type: 'video' | 'playlist' | 'shorts' | 'unknown';
  urlId?: string;
  listId?: string;
  originalUrl: string;
}

export function parseYouTubeUrl(url: string): ParsedUrl {
  let type: ParsedUrl['type'] = 'unknown';
  let urlId: string | undefined;
  let listId: string | undefined;

  const videoRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|e\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const playlistRegex = /(?:youtube\.com\/(?:playlist\?list=))([a-zA-Z0-9_-]+)/;
  const shortsRegex = /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

  let match;

  // Try to match shorts URL
  match = url.match(shortsRegex);
  if (match && match[1]) {
    type = 'shorts';
    urlId = match[1];
    return { type, urlId, originalUrl: url };
  }

  // Try to match video URL
  match = url.match(videoRegex);
  if (match && match[1]) {
    type = 'video';
    urlId = match[1];
    const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch && listMatch[1]) {
      listId = listMatch[1];
    }
    return { type, urlId, ...(listId && { listId }), originalUrl: url };
  }

  // Try to match playlist URL
  match = url.match(playlistRegex);
  if (match && match[1]) {
    type = 'playlist';
    listId = match[1];
    return { type, listId, originalUrl: url };
  }

  return { type, originalUrl: url };
}

export function getUniqueIdFromParsedUrl(parsedUrl: ParsedUrl): string {
  if (parsedUrl.type === 'playlist' && parsedUrl.listId) {
    return `${parsedUrl.listId}`;
  }
  if (parsedUrl.urlId) {
    return parsedUrl.urlId;
  }
  // Fallback for unknown types or if no specific ID is found
  return parsedUrl.originalUrl;
}

export const validateUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

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